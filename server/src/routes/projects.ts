import { Router, type Request, type Response } from "express";
import type { Db } from "@paperclipai/db";
import {
  createProjectDeployApprovalSchema,
  createProjectDeployCommandRecordSchema,
  createProjectDeploymentTargetSchema,
  createProjectInfraHealthCheckSchema,
  createProjectInfraIncidentSchema,
  createProjectInfraActionEvidenceSchema,
  createProjectInfraActionProposalSchema,
  createProjectInfraTargetSchema,
  createProjectSchema,
  projectFileBranchCreateSchema,
  projectFileBranchPushSchema,
  projectFileBranchSwitchSchema,
  projectFileCreateSchema,
  projectFileDeleteSchema,
  projectFileReadSchema,
  projectFileRenameSchema,
  projectFileSaveSchema,
  projectFilesPathSchema,
  recordProjectDeployEventStatusSchema,
  recordExternalProjectInfraHealthResultSchema,
  recordProjectInfraHealthResultSchema,
  sendProjectDeployMaintenanceMessageSchema,
  createProjectWorkspaceSchema,
  findWorkspaceCommandDefinition,
  isUuidLike,
  matchWorkspaceRuntimeServiceToCommand,
  updateProjectSchema,
  updateProjectDeploymentTargetSchema,
  updateProjectInfraHealthCheckSchema,
  updateProjectInfraIncidentSchema,
  updateProjectInfraTargetSchema,
  updateProjectWorkspaceSchema,
  workspaceRuntimeControlTargetSchema,
} from "@paperclipai/shared";
import type { WorkspaceRuntimeDesiredState, WorkspaceRuntimeServiceStateMap } from "@paperclipai/shared";
import { trackProjectCreated } from "@paperclipai/shared/telemetry";
import { validate } from "../middleware/validate.js";
import { projectFilesService, projectService, logActivity, workspaceOperationService, initWorkspaceGit } from "../services/index.js";
import { conflict, notFound, forbidden } from "../errors.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";
import {
  buildWorkspaceRuntimeDesiredStatePatch,
  listConfiguredRuntimeServiceEntries,
  runWorkspaceJobForControl,
  startRuntimeServicesForWorkspaceControl,
  stopRuntimeServicesForProjectWorkspace,
} from "../services/workspace-runtime.js";
import { resolveManagedProjectWorkspaceDir } from "../home-paths.js";
import {
  assertNoAgentHostWorkspaceCommandMutation,
  collectProjectExecutionWorkspaceCommandPaths,
  collectProjectWorkspaceCommandPaths,
} from "./workspace-command-authz.js";
import { assertCanManageProjectWorkspaceRuntimeServices } from "./workspace-runtime-service-authz.js";
import { sendProjectDeployMaintenanceEmailWithResult } from "../services/email.js";
import { getTelemetryClient } from "../telemetry.js";
import { appendWithCap } from "../adapters/utils.js";
import { assertEnvironmentSelectionForCompany } from "./environment-selection.js";
import { approvalService } from "../services/approvals.js";
import { environmentService } from "../services/environments.js";
import { issueApprovalService } from "../services/issue-approvals.js";
import { issueService } from "../services/issues.js";
import { secretService } from "../services/secrets.js";

const WORKSPACE_CONTROL_OUTPUT_MAX_CHARS = 256 * 1024;
const SHARED_WORKSPACE_STOP_AND_RESTART_ACTIONS = new Set(["stop", "restart"]);

function deployEventStatusForCommandRecord(
  commandType: "deploy" | "rollback",
  commandStatus: string,
): "deploying" | "deployed" | "failed" | "rolled_back" | null {
  if (commandType === "deploy") {
    if (commandStatus === "running") return "deploying";
    if (commandStatus === "succeeded") return "deployed";
    if (commandStatus === "failed") return "failed";
  }
  if (commandType === "rollback" && commandStatus === "succeeded") {
    return "rolled_back";
  }
  return null;
}

export function projectRoutes(db: Db) {
  const router = Router();
  const svc = projectService(db);
  const filesSvc = projectFilesService(db);
  const secretsSvc = secretService(db);
  const workspaceOperations = workspaceOperationService(db);
  const strictSecretsMode = process.env.PAPERCLIP_SECRETS_STRICT_MODE === "true";
  const environmentsSvc = environmentService(db);
  const approvalsSvc = approvalService(db);
  const issueApprovalsSvc = issueApprovalService(db);
  const issuesSvc = issueService(db);

  async function assertProjectEnvironmentSelection(companyId: string, environmentId: string | null | undefined) {
    if (environmentId === undefined || environmentId === null) return;
    await assertEnvironmentSelectionForCompany(environmentsSvc, companyId, environmentId, {
      allowedDrivers: ["local", "ssh", "sandbox"],
    });
  }

  function readProjectPolicyEnvironmentId(policy: unknown): string | null | undefined {
    if (!policy || typeof policy !== "object" || !("environmentId" in policy)) {
      return undefined;
    }
    const environmentId = (policy as { environmentId?: unknown }).environmentId;
    return typeof environmentId === "string" || environmentId === null ? environmentId : undefined;
  }

  async function resolveCompanyIdForProjectReference(req: Request) {
    const companyIdQuery = req.query.companyId;
    const requestedCompanyId =
      typeof companyIdQuery === "string" && companyIdQuery.trim().length > 0
        ? companyIdQuery.trim()
        : null;
    if (requestedCompanyId) {
      assertCompanyAccess(req, requestedCompanyId);
      return requestedCompanyId;
    }
    if (req.actor.type === "agent" && req.actor.companyId) {
      return req.actor.companyId;
    }
    return null;
  }

  async function normalizeProjectReference(req: Request, rawId: string) {
    if (isUuidLike(rawId)) return rawId;
    const companyId = await resolveCompanyIdForProjectReference(req);
    if (!companyId) return rawId;
    const resolved = await svc.resolveByReference(companyId, rawId);
    if (resolved.ambiguous) {
      throw conflict("Project shortname is ambiguous in this company. Use the project ID.");
    }
    if (!resolved.project) {
      throw notFound("Project not found");
    }
    return resolved.project?.id ?? rawId;
  }

  function externalMonitorTokenFromRequest(req: Request) {
    const auth = req.header("authorization");
    if (auth?.toLowerCase().startsWith("bearer ")) {
      return auth.slice("bearer ".length).trim();
    }
    return req.header("x-paperclip-monitor-token")?.trim() ?? "";
  }

  router.param("id", async (req, _res, next, rawId) => {
    try {
      req.params.id = await normalizeProjectReference(req, rawId);
      next();
    } catch (err) {
      next(err);
    }
  });

  router.post(
    "/external/infra-health-checks/:healthCheckId/results",
    validate(recordExternalProjectInfraHealthResultSchema),
    async (req, res) => {
      const healthCheckId = req.params.healthCheckId as string;
      const token = externalMonitorTokenFromRequest(req);
      if (!token) {
        res.status(401).json({ error: "External monitor token required" });
        return;
      }

      const healthCheck = await svc.recordExternalInfraHealthResult(healthCheckId, token, {
        status: req.body.status,
        checkedAt: req.body.checkedAt,
        latencyMs: req.body.latencyMs ?? null,
        error: req.body.error ?? null,
        sourceId: req.body.sourceId ?? null,
        sourceDetail: req.body.sourceDetail ?? null,
        sourceMetadata: req.body.sourceMetadata ?? null,
      });
      if (!healthCheck) {
        res.status(404).json({ error: "Infrastructure health check not found" });
        return;
      }

      await logActivity(db, {
        companyId: healthCheck.companyId,
        actorType: "system",
        actorId: "external_monitor",
        action: "project.infra_health_result_recorded",
        entityType: "project",
        entityId: healthCheck.projectId,
        details: {
          healthCheckId: healthCheck.id,
          status: healthCheck.status,
          sourceKind: healthCheck.lastSourceKind,
          sourceId: healthCheck.lastSourceId,
          external: true,
        },
      });

      res.json({ healthCheck });
    },
  );

  router.get("/companies/:companyId/projects", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const result = await svc.list(companyId);
    res.json(result);
  });

  router.get("/projects/:id", async (req, res) => {
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, project.companyId);
    res.json(project);
  });

  router.post("/companies/:companyId/projects", validate(createProjectSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    type CreateProjectPayload = Parameters<typeof svc.create>[1] & {
      workspace?: Parameters<typeof svc.createWorkspace>[1];
    };

    const { workspace, ...projectData } = req.body as CreateProjectPayload;
    await assertProjectEnvironmentSelection(
      companyId,
      readProjectPolicyEnvironmentId(projectData.executionWorkspacePolicy),
    );
    assertNoAgentHostWorkspaceCommandMutation(
      req,
      [
        ...collectProjectExecutionWorkspaceCommandPaths(projectData.executionWorkspacePolicy),
        ...collectProjectWorkspaceCommandPaths(workspace, "workspace"),
      ],
    );
    if (projectData.env !== undefined) {
      projectData.env = await secretsSvc.normalizeEnvBindingsForPersistence(
        companyId,
        projectData.env,
        { strictMode: strictSecretsMode, fieldPath: "env" },
      );
    }
    const project = await svc.create(companyId, projectData);
    if (project.env) {
      await secretsSvc.syncEnvBindingsForTarget?.(
        companyId,
        { targetType: "project", targetId: project.id },
        project.env,
      );
    }
    let createdWorkspaceId: string | null = null;
    if (workspace) {
      const createdWorkspace = await svc.createWorkspace(project.id, workspace);
      if (!createdWorkspace) {
        await svc.remove(project.id);
        res.status(422).json({ error: "Invalid project workspace payload" });
        return;
      }
      const managedPath = resolveManagedProjectWorkspaceDir({
        companyId,
        projectId: project.id,
        workspaceId: createdWorkspace.id,
      });
      const relocatedWorkspace = await svc.updateWorkspace(project.id, createdWorkspace.id, {
        cwd: managedPath,
        name: createdWorkspace.name,
      });
      if (!relocatedWorkspace) {
        await svc.remove(project.id);
        res.status(422).json({ error: "Failed to initialize project workspace" });
        return;
      }
      createdWorkspaceId = createdWorkspace.id;
    } else {
      // Auto-create a default workspace pointing to the managed folder so every
      // project has a local git repo, even if no workspace was explicitly provided.
      const managedPath = resolveManagedProjectWorkspaceDir({ companyId, projectId: project.id });
      const autoWorkspace = await svc.createWorkspace(project.id, {
        name: project.name,
        cwd: managedPath,
        sourceType: "local_path",
      });
      if (autoWorkspace) {
        const finalPath = resolveManagedProjectWorkspaceDir({
          companyId,
          projectId: project.id,
          workspaceId: autoWorkspace.id,
        });
        const relocatedWorkspace = await svc.updateWorkspace(project.id, autoWorkspace.id, {
          cwd: finalPath,
          name: autoWorkspace.name,
        });
        if (!relocatedWorkspace) {
          await svc.remove(project.id);
          res.status(422).json({ error: "Failed to initialize project workspace" });
          return;
        }
        createdWorkspaceId = autoWorkspace.id;
      }
    }
    const hydratedProject = await svc.getById(project.id);

    // Fire-and-forget: initialize (or clone) the git workspace without blocking the response.
    const projectId = project.id;
    setImmediate(() => {
      svc.getById(projectId).then((fullProject) => {
        if (fullProject) return initWorkspaceGit(fullProject);
      }).catch((err) => {
        console.error("[git-init] workspace init failed for project", projectId, err);
      });
    });

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.created",
      entityType: "project",
      entityId: project.id,
      details: {
        name: project.name,
        workspaceId: createdWorkspaceId,
        envKeys: project.env ? Object.keys(project.env).sort() : [],
      },
    });
    const telemetryClient = getTelemetryClient();
    if (telemetryClient) {
      trackProjectCreated(telemetryClient);
    }
    res.status(201).json(hydratedProject ?? project);
  });

  router.patch("/projects/:id", validate(updateProjectSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    const body = { ...req.body };
    assertNoAgentHostWorkspaceCommandMutation(
      req,
      collectProjectExecutionWorkspaceCommandPaths(body.executionWorkspacePolicy),
    );
    await assertProjectEnvironmentSelection(
      existing.companyId,
      readProjectPolicyEnvironmentId(body.executionWorkspacePolicy),
    );
    if (typeof body.archivedAt === "string") {
      body.archivedAt = new Date(body.archivedAt);
    }
    if (body.env !== undefined) {
      body.env = await secretsSvc.normalizeEnvBindingsForPersistence(existing.companyId, body.env, {
        strictMode: strictSecretsMode,
        fieldPath: "env",
      });
    }
    const project = await svc.update(id, body);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    if (body.env !== undefined) {
      await secretsSvc.syncEnvBindingsForTarget?.(
        project.companyId,
        { targetType: "project", targetId: project.id },
        project.env,
      );
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.updated",
      entityType: "project",
      entityId: project.id,
      details: {
        changedKeys: Object.keys(req.body).sort(),
        envKeys:
          body.env && typeof body.env === "object" && !Array.isArray(body.env)
            ? Object.keys(body.env as Record<string, unknown>).sort()
            : undefined,
      },
    });

    res.json(project);
  });

  router.get("/projects/:id/deployment-targets", async (req, res) => {
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, project.companyId);
    res.json(await svc.listDeploymentTargets(id));
  });

  router.post("/projects/:id/deployment-targets", validate(createProjectDeploymentTargetSchema), async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, project.companyId);

    const target = await svc.createDeploymentTarget(id, req.body);
    if (!target) {
      res.status(422).json({ error: "Invalid deployment target payload" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.deployment_target_created",
      entityType: "project",
      entityId: id,
      details: {
        deploymentTargetId: target.id,
        name: target.name,
        environment: target.environment,
        provider: target.provider,
      },
    });

    res.status(201).json(target);
  });

  router.patch(
    "/projects/:id/deployment-targets/:deploymentTargetId",
    validate(updateProjectDeploymentTargetSchema),
    async (req, res) => {
      assertBoard(req);
      const id = req.params.id as string;
      const deploymentTargetId = req.params.deploymentTargetId as string;
      const project = await svc.getById(id);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      assertCompanyAccess(req, project.companyId);

      const target = await svc.updateDeploymentTarget(id, deploymentTargetId, req.body);
      if (!target) {
        res.status(404).json({ error: "Deployment target not found" });
        return;
      }

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId: project.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "project.deployment_target_updated",
        entityType: "project",
        entityId: id,
        details: {
          deploymentTargetId: target.id,
          changedKeys: Object.keys(req.body).sort(),
        },
      });

      res.json(target);
    },
  );

  router.delete("/projects/:id/deployment-targets/:deploymentTargetId", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const deploymentTargetId = req.params.deploymentTargetId as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, project.companyId);

    const target = await svc.removeDeploymentTarget(id, deploymentTargetId);
    if (!target) {
      res.status(404).json({ error: "Deployment target not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.deployment_target_deleted",
      entityType: "project",
      entityId: id,
      details: { deploymentTargetId: target.id, name: target.name },
    });

    res.json(target);
  });

  router.get("/projects/:id/infra-targets", async (req, res) => {
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, project.companyId);
    res.json(await svc.listInfraTargets(id));
  });

  router.post("/projects/:id/infra-targets", validate(createProjectInfraTargetSchema), async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, project.companyId);
    if (req.body.deploymentTargetId) {
      const deploymentTarget = await svc.getDeploymentTarget(id, req.body.deploymentTargetId);
      if (!deploymentTarget || deploymentTarget.companyId !== project.companyId) {
        res.status(422).json({ error: "Infrastructure target deployment target is invalid" });
        return;
      }
    }

    const target = await svc.createInfraTarget(id, req.body);
    if (!target) {
      res.status(422).json({ error: "Invalid infrastructure target payload" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.infra_target_created",
      entityType: "project",
      entityId: id,
      details: {
        infraTargetId: target.id,
        name: target.name,
        provider: target.provider,
        environment: target.environment,
      },
    });

    res.status(201).json(target);
  });

  router.patch("/projects/:id/infra-targets/:infraTargetId", validate(updateProjectInfraTargetSchema), async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const infraTargetId = req.params.infraTargetId as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, project.companyId);
    if (req.body.deploymentTargetId) {
      const deploymentTarget = await svc.getDeploymentTarget(id, req.body.deploymentTargetId);
      if (!deploymentTarget || deploymentTarget.companyId !== project.companyId) {
        res.status(422).json({ error: "Infrastructure target deployment target is invalid" });
        return;
      }
    }

    const target = await svc.updateInfraTarget(id, infraTargetId, req.body);
    if (!target) {
      res.status(404).json({ error: "Infrastructure target not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.infra_target_updated",
      entityType: "project",
      entityId: id,
      details: { infraTargetId: target.id, changedKeys: Object.keys(req.body).sort() },
    });

    res.json(target);
  });

  router.delete("/projects/:id/infra-targets/:infraTargetId", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const infraTargetId = req.params.infraTargetId as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, project.companyId);

    const target = await svc.removeInfraTarget(id, infraTargetId);
    if (!target) {
      res.status(404).json({ error: "Infrastructure target not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.infra_target_deleted",
      entityType: "project",
      entityId: id,
      details: { infraTargetId: target.id, name: target.name },
    });

    res.json(target);
  });

  router.get("/projects/:id/infra-health-checks", async (req, res) => {
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, project.companyId);
    res.json(await svc.listInfraHealthChecks(id));
  });

  router.post("/projects/:id/infra-health-checks", validate(createProjectInfraHealthCheckSchema), async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, project.companyId);
    if (req.body.infraTargetId) {
      const infraTarget = await svc.getInfraTarget(id, req.body.infraTargetId);
      if (!infraTarget || infraTarget.companyId !== project.companyId) {
        res.status(422).json({ error: "Infrastructure health check target is invalid" });
        return;
      }
    }

    const healthCheck = await svc.createInfraHealthCheck(id, req.body);
    if (!healthCheck) {
      res.status(422).json({ error: "Invalid infrastructure health check payload" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.infra_health_check_created",
      entityType: "project",
      entityId: id,
      details: { healthCheckId: healthCheck.id, name: healthCheck.name, checkType: healthCheck.checkType },
    });

    res.status(201).json(healthCheck);
  });

  router.patch(
    "/projects/:id/infra-health-checks/:healthCheckId",
    validate(updateProjectInfraHealthCheckSchema),
    async (req, res) => {
      assertBoard(req);
      const id = req.params.id as string;
      const healthCheckId = req.params.healthCheckId as string;
      const project = await svc.getById(id);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      assertCompanyAccess(req, project.companyId);
      if (req.body.infraTargetId) {
        const infraTarget = await svc.getInfraTarget(id, req.body.infraTargetId);
        if (!infraTarget || infraTarget.companyId !== project.companyId) {
          res.status(422).json({ error: "Infrastructure health check target is invalid" });
          return;
        }
      }

      const healthCheck = await svc.updateInfraHealthCheck(id, healthCheckId, req.body);
      if (!healthCheck) {
        res.status(404).json({ error: "Infrastructure health check not found" });
        return;
      }

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId: project.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "project.infra_health_check_updated",
        entityType: "project",
        entityId: id,
        details: { healthCheckId: healthCheck.id, changedKeys: Object.keys(req.body).sort() },
      });

      res.json(healthCheck);
    },
  );

  router.post(
    "/projects/:id/infra-health-checks/:healthCheckId/results",
    validate(recordProjectInfraHealthResultSchema),
    async (req, res) => {
      const id = req.params.id as string;
      const healthCheckId = req.params.healthCheckId as string;
      const project = await svc.getById(id);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      assertCompanyAccess(req, project.companyId);

      const existing = await svc.getInfraHealthCheck(id, healthCheckId);
      if (!existing || existing.companyId !== project.companyId) {
        res.status(404).json({ error: "Infrastructure health check not found" });
        return;
      }

      const healthCheck = await svc.recordInfraHealthResult(id, healthCheckId, {
        status: req.body.status,
        checkedAt: req.body.checkedAt,
        latencyMs: req.body.latencyMs ?? null,
        error: req.body.error ?? null,
        sourceKind: req.body.sourceKind,
        sourceId: req.body.sourceId ?? null,
        sourceDetail: req.body.sourceDetail ?? null,
        sourceMetadata: req.body.sourceMetadata ?? null,
      });
      if (!healthCheck) {
        res.status(404).json({ error: "Infrastructure health check not found" });
        return;
      }

      let incident = null;
      if (req.body.createIncident) {
        if (!["degraded", "unhealthy"].includes(healthCheck.status)) {
          res.status(422).json({ error: "Only degraded or unhealthy health results can create infra incidents" });
          return;
        }
        const openExisting = (await svc.listInfraIncidents(id)).find(
          (candidate) =>
            candidate.sourceKind === "health_check" &&
            candidate.sourceId === healthCheck.id &&
            (candidate.status === "open" || candidate.status === "investigating"),
        );
        if (openExisting) {
          incident = openExisting;
        } else {
          const summary = req.body.incidentSummary
            ?? `${healthCheck.name} reported ${healthCheck.status}`;
          const issue = await issuesSvc.create(project.companyId, {
            title: `[Infra] ${summary}`.slice(0, 300),
            description: [
              "Created from an infrastructure health check result.",
              "",
              `Project: ${project.name}`,
              `Health check: ${healthCheck.name}`,
              `Status: ${healthCheck.status}`,
              `Source: ${healthCheck.lastSourceKind ?? "operator"}`,
              healthCheck.lastSourceId ? `Source ID: ${healthCheck.lastSourceId}` : null,
              `Checked at: ${healthCheck.lastCheckedAt?.toISOString() ?? "unknown"}`,
              healthCheck.url ? `URL: ${healthCheck.url}` : null,
              healthCheck.lastError ? `Error: ${healthCheck.lastError}` : null,
              healthCheck.lastSourceDetail ? `Source detail: ${healthCheck.lastSourceDetail}` : null,
              "",
              "Provider repair and failover actions require explicit approval and are not executed automatically.",
            ].filter(Boolean).join("\n"),
            status: "backlog",
            priority: req.body.severity === "urgent" ? "critical" : "high",
            projectId: project.id,
            originKind: "infra_health_check",
            originId: healthCheck.id,
            originFingerprint: `${healthCheck.id}:${healthCheck.status}:${healthCheck.lastCheckedAt?.toISOString() ?? "unknown"}`,
          });
          incident = await svc.createInfraIncident(id, {
            infraTargetId: healthCheck.infraTargetId,
            healthCheckId: healthCheck.id,
            issueId: issue.id,
            sourceKind: "health_check",
            sourceId: healthCheck.id,
            status: "open",
            severity: req.body.severity,
            summary,
            details: req.body.incidentDetails ?? healthCheck.lastError ?? null,
            recommendedAction: "Investigate health check failure. Provider repair and failover require separate approval.",
          });
        }
      }

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId: project.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "project.infra_health_result_recorded",
        entityType: "project",
        entityId: id,
        details: {
          healthCheckId: healthCheck.id,
          status: healthCheck.status,
          sourceKind: healthCheck.lastSourceKind,
          sourceId: healthCheck.lastSourceId,
          incidentId: incident?.id ?? null,
        },
      });

      res.json({ healthCheck, incident });
    },
  );

  router.post("/projects/:id/infra-health-checks/:healthCheckId/external-monitor-token", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const healthCheckId = req.params.healthCheckId as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, project.companyId);

    const result = await svc.rotateInfraHealthExternalMonitorToken(id, healthCheckId);
    if (!result || result.healthCheck.companyId !== project.companyId) {
      res.status(404).json({ error: "Infrastructure health check not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.infra_health_external_monitor_token_rotated",
      entityType: "project",
      entityId: id,
      details: { healthCheckId: result.healthCheck.id, tokenHint: result.healthCheck.externalMonitorTokenHint },
    });

    res.json(result);
  });

  router.delete("/projects/:id/infra-health-checks/:healthCheckId/external-monitor-token", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const healthCheckId = req.params.healthCheckId as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, project.companyId);

    const healthCheck = await svc.revokeInfraHealthExternalMonitorToken(id, healthCheckId);
    if (!healthCheck || healthCheck.companyId !== project.companyId) {
      res.status(404).json({ error: "Infrastructure health check not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.infra_health_external_monitor_token_revoked",
      entityType: "project",
      entityId: id,
      details: { healthCheckId: healthCheck.id },
    });

    res.json(healthCheck);
  });

  router.delete("/projects/:id/infra-health-checks/:healthCheckId", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const healthCheckId = req.params.healthCheckId as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, project.companyId);

    const healthCheck = await svc.removeInfraHealthCheck(id, healthCheckId);
    if (!healthCheck) {
      res.status(404).json({ error: "Infrastructure health check not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.infra_health_check_deleted",
      entityType: "project",
      entityId: id,
      details: { healthCheckId: healthCheck.id, name: healthCheck.name },
    });

    res.json(healthCheck);
  });

  router.get("/projects/:id/infra-incidents", async (req, res) => {
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, project.companyId);
    res.json(await svc.listInfraIncidents(id));
  });

  router.post("/projects/:id/infra-incidents", validate(createProjectInfraIncidentSchema), async (req, res) => {
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, project.companyId);
    if (req.body.infraTargetId) {
      const infraTarget = await svc.getInfraTarget(id, req.body.infraTargetId);
      if (!infraTarget || infraTarget.companyId !== project.companyId) {
        res.status(422).json({ error: "Infrastructure incident target is invalid" });
        return;
      }
    }
    if (req.body.healthCheckId) {
      const healthCheck = await svc.getInfraHealthCheck(id, req.body.healthCheckId);
      if (!healthCheck || healthCheck.companyId !== project.companyId) {
        res.status(422).json({ error: "Infrastructure incident health check is invalid" });
        return;
      }
    }
    if (req.body.issueId) {
      const issue = await issuesSvc.getById(req.body.issueId);
      if (!issue || issue.companyId !== project.companyId || issue.projectId !== project.id) {
        res.status(422).json({ error: "Infrastructure incident issue is invalid" });
        return;
      }
    }

    const incident = await svc.createInfraIncident(id, req.body);
    if (!incident) {
      res.status(422).json({ error: "Invalid infrastructure incident payload" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.infra_incident_created",
      entityType: "project",
      entityId: id,
      details: { infraIncidentId: incident.id, sourceKind: incident.sourceKind, severity: incident.severity },
    });

    res.status(201).json(incident);
  });

  router.patch(
    "/projects/:id/infra-incidents/:incidentId",
    validate(updateProjectInfraIncidentSchema),
    async (req, res) => {
      const id = req.params.id as string;
      const incidentId = req.params.incidentId as string;
      const project = await svc.getById(id);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      assertCompanyAccess(req, project.companyId);

      const incident = await svc.updateInfraIncident(id, incidentId, req.body);
      if (!incident) {
        res.status(404).json({ error: "Infrastructure incident not found" });
        return;
      }

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId: project.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "project.infra_incident_updated",
        entityType: "project",
        entityId: id,
        details: { infraIncidentId: incident.id, changedKeys: Object.keys(req.body).sort() },
      });

      res.json(incident);
    },
  );

  router.get("/projects/:id/infra-action-proposals", async (req, res) => {
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, project.companyId);
    res.json(await svc.listInfraActionProposals(id));
  });

  router.post(
    "/projects/:id/infra-incidents/:incidentId/action-proposals",
    validate(createProjectInfraActionProposalSchema),
    async (req, res) => {
      const id = req.params.id as string;
      const incidentId = req.params.incidentId as string;
      const project = await svc.getById(id);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      assertCompanyAccess(req, project.companyId);

      const incident = await svc.getInfraIncident(id, incidentId);
      if (!incident || incident.companyId !== project.companyId) {
        res.status(404).json({ error: "Infrastructure incident not found" });
        return;
      }
      if (incident.status === "resolved" || incident.status === "ignored") {
        res.status(422).json({ error: "Cannot propose infra actions for closed incidents" });
        return;
      }
      const infraTargetId = req.body.infraTargetId ?? incident.infraTargetId ?? null;
      let infraTarget = null;
      if (infraTargetId) {
        infraTarget = await svc.getInfraTarget(id, infraTargetId);
        if (!infraTarget || infraTarget.companyId !== project.companyId) {
          res.status(422).json({ error: "Infrastructure action target is invalid" });
          return;
        }
      }

      const actor = getActorInfo(req);
      const approval = await approvalsSvc.create(project.companyId, {
        type: "infra_repair",
        requestedByAgentId: actor.actorType === "agent" ? actor.actorId : null,
        requestedByUserId: actor.actorType === "user" ? actor.actorId : null,
        status: "pending",
        payload: {
          project: { id: project.id, name: project.name },
          incident: {
            id: incident.id,
            summary: incident.summary,
            severity: incident.severity,
            status: incident.status,
          },
          infraTarget: infraTarget
            ? {
                id: infraTarget.id,
                name: infraTarget.name,
                provider: infraTarget.provider,
                region: infraTarget.region,
                host: infraTarget.host,
                failoverGroup: infraTarget.failoverGroup,
                failoverRank: infraTarget.failoverRank,
              }
            : null,
          actionType: req.body.actionType,
          summary: req.body.summary,
          rationale: req.body.rationale,
          proposedAction: req.body.proposedAction,
          rollbackPlan: req.body.rollbackPlan ?? null,
          risk: req.body.risk ?? null,
          evidenceRequired: req.body.evidenceRequired ?? null,
          providerMutationAllowed: false,
        },
        decisionNote: null,
        decidedByUserId: null,
        decidedAt: null,
        updatedAt: new Date(),
      });
      if (incident.issueId) {
        await issueApprovalsSvc.linkManyForApproval(approval.id, [incident.issueId], {
          agentId: actor.agentId,
          userId: actor.actorType === "user" ? actor.actorId : null,
        });
      }

      const proposal = await svc.createInfraActionProposal(id, {
        incidentId: incident.id,
        infraTargetId,
        approvalId: approval.id,
        actionType: req.body.actionType,
        status: "approval_requested",
        summary: req.body.summary,
        rationale: req.body.rationale,
        proposedAction: req.body.proposedAction,
        rollbackPlan: req.body.rollbackPlan ?? null,
        risk: req.body.risk ?? null,
        provider: req.body.provider ?? infraTarget?.provider ?? null,
        region: req.body.region ?? infraTarget?.region ?? null,
        evidenceRequired: req.body.evidenceRequired ?? null,
        metadata: req.body.metadata ?? null,
        createdByAgentId: actor.actorType === "agent" ? actor.actorId : null,
        createdByUserId: actor.actorType === "user" ? actor.actorId : null,
      });
      if (!proposal) {
        res.status(422).json({ error: "Invalid infrastructure action proposal payload" });
        return;
      }

      await svc.updateInfraIncident(id, incident.id, {
        status: incident.status === "open" ? "investigating" : incident.status,
        repairApprovalId: approval.id,
      });

      await logActivity(db, {
        companyId: project.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "project.infra_action_proposed",
        entityType: "project",
        entityId: id,
        details: {
          infraIncidentId: incident.id,
          infraActionProposalId: proposal.id,
          approvalId: approval.id,
          actionType: proposal.actionType,
        },
      });

      res.status(201).json({ approval, proposal });
    },
  );

  router.get("/projects/:id/infra-action-proposals/:proposalId/evidence", async (req, res) => {
    const id = req.params.id as string;
    const proposalId = req.params.proposalId as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, project.companyId);
    const proposal = await svc.getInfraActionProposal(id, proposalId);
    if (!proposal || proposal.companyId !== project.companyId) {
      res.status(404).json({ error: "Infrastructure action proposal not found" });
      return;
    }
    res.json(await svc.listInfraActionEvidence(id, proposal.id));
  });

  router.post(
    "/projects/:id/infra-action-proposals/:proposalId/evidence",
    validate(createProjectInfraActionEvidenceSchema),
    async (req, res) => {
      const id = req.params.id as string;
      const proposalId = req.params.proposalId as string;
      const project = await svc.getById(id);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      assertCompanyAccess(req, project.companyId);

      const proposal = await svc.getInfraActionProposal(id, proposalId);
      if (!proposal || proposal.companyId !== project.companyId) {
        res.status(404).json({ error: "Infrastructure action proposal not found" });
        return;
      }
      if (!proposal.approvalId) {
        res.status(422).json({ error: "Infrastructure action proposal is not linked to an approval" });
        return;
      }
      const approval = await approvalsSvc.getById(proposal.approvalId);
      if (!approval || approval.companyId !== project.companyId || approval.type !== "infra_repair") {
        res.status(404).json({ error: "Infrastructure repair approval not found" });
        return;
      }
      if (approval.status !== "approved") {
        res.status(422).json({ error: "Infrastructure action evidence requires approved repair approval" });
        return;
      }
      if (req.actor.type === "agent" && approval.requestedByAgentId !== req.actor.agentId) {
        throw forbidden("Only the requesting agent can record infrastructure action evidence");
      }

      const actor = getActorInfo(req);
      const evidence = await svc.createInfraActionEvidence(id, {
        proposalId: proposal.id,
        approvalId: approval.id,
        status: req.body.status,
        evidence: req.body.evidence,
        output: req.body.output ?? null,
        recordedByAgentId: actor.actorType === "agent" ? actor.actorId : null,
        recordedByUserId: actor.actorType === "user" ? actor.actorId : null,
      });
      if (!evidence) {
        res.status(422).json({ error: "Invalid infrastructure action evidence payload" });
        return;
      }
      if (req.body.status === "succeeded" || req.body.status === "failed" || req.body.status === "cancelled") {
        await svc.updateInfraActionProposal(id, proposal.id, { status: req.body.status });
      }

      await logActivity(db, {
        companyId: project.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "project.infra_action_evidence_recorded",
        entityType: "project",
        entityId: id,
        details: {
          infraActionProposalId: proposal.id,
          approvalId: approval.id,
          evidenceId: evidence.id,
          status: evidence.status,
        },
      });

      res.status(201).json(evidence);
    },
  );

  router.get("/projects/:id/deploy-events", async (req, res) => {
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, project.companyId);
    res.json(await svc.listDeployEvents(id));
  });

  router.patch(
    "/projects/:id/deploy-events/:deployEventId/status",
    validate(recordProjectDeployEventStatusSchema),
    async (req, res) => {
      const id = req.params.id as string;
      const deployEventId = req.params.deployEventId as string;
      const project = await svc.getById(id);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      assertCompanyAccess(req, project.companyId);

      const deployEvent = await svc.getDeployEvent(id, deployEventId);
      if (!deployEvent || deployEvent.companyId !== project.companyId) {
        res.status(404).json({ error: "Deploy event not found" });
        return;
      }
      if (!deployEvent.approvalId) {
        assertBoard(req);
        res.status(422).json({ error: "Deploy event is not linked to an approval" });
        return;
      }

      const approval = await approvalsSvc.getById(deployEvent.approvalId);
      if (!approval || approval.companyId !== project.companyId || approval.type !== "deploy_change") {
        res.status(404).json({ error: "Deploy approval not found" });
        return;
      }
      if (approval.status !== "approved") {
        res.status(422).json({ error: "Deploy event cannot be executed until its approval is approved" });
        return;
      }

      if (req.actor.type === "agent" && approval.requestedByAgentId !== req.actor.agentId) {
        throw forbidden("Only the requesting agent can update this deploy event");
      }

      const nextStatus = req.body.status as "deploying" | "deployed" | "failed" | "rolled_back";
      const allowedNextStatuses: Record<string, Set<typeof nextStatus>> = {
        approved: new Set(["deploying", "deployed", "failed"]),
        deploying: new Set(["deployed", "failed"]),
        failed: new Set(["rolled_back"]),
        deployed: new Set(["rolled_back"]),
      };
      const allowed = allowedNextStatuses[deployEvent.status]?.has(nextStatus) === true;
      if (!allowed) {
        res.status(422).json({ error: `Cannot transition deploy event from ${deployEvent.status} to ${nextStatus}` });
        return;
      }

      const actor = getActorInfo(req);
      const updated = await svc.updateDeployEventStatus(id, deployEvent.id, {
        status: nextStatus,
        note: req.body.note ?? null,
        maintenanceMessage: req.body.maintenanceMessage ?? null,
        metadata: req.body.metadata ?? null,
        actor,
      });
      if (!updated) {
        res.status(404).json({ error: "Deploy event not found" });
        return;
      }

      await logActivity(db, {
        companyId: project.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "project.deploy_event_status_updated",
        entityType: "project",
        entityId: project.id,
        details: {
          deployEventId: deployEvent.id,
          approvalId: deployEvent.approvalId,
          fromStatus: deployEvent.status,
          toStatus: updated.status,
          issueId: deployEvent.issueId,
          deploymentTargetId: deployEvent.deploymentTargetId,
        },
      });

      res.json(updated);
    },
  );

  router.post(
    "/projects/:id/deploy-events/:deployEventId/maintenance-message",
    validate(sendProjectDeployMaintenanceMessageSchema),
    async (req, res) => {
      const id = req.params.id as string;
      const deployEventId = req.params.deployEventId as string;
      const project = await svc.getById(id);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      assertCompanyAccess(req, project.companyId);

      const deployEvent = await svc.getDeployEvent(id, deployEventId);
      if (!deployEvent || deployEvent.companyId !== project.companyId) {
        res.status(404).json({ error: "Deploy event not found" });
        return;
      }
      if (deployEvent.maintenanceMessageStatus === "sent") {
        res.json(deployEvent);
        return;
      }
      if (!deployEvent.approvalId) {
        res.status(422).json({ error: "Deploy event is not linked to an approval" });
        return;
      }
      if (!deployEvent.deploymentTargetId) {
        res.status(422).json({ error: "Deploy event is not linked to a deployment target" });
        return;
      }

      const [approval, deploymentTarget, issue] = await Promise.all([
        approvalsSvc.getById(deployEvent.approvalId),
        svc.getDeploymentTarget(id, deployEvent.deploymentTargetId),
        deployEvent.issueId ? issuesSvc.getById(deployEvent.issueId) : Promise.resolve(null),
      ]);
      if (!approval || approval.companyId !== project.companyId || approval.type !== "deploy_change") {
        res.status(404).json({ error: "Deploy approval not found" });
        return;
      }
      if (approval.status !== "approved") {
        res.status(422).json({ error: "Deploy maintenance messages require approved deploy approval" });
        return;
      }
      if (req.actor.type === "agent" && approval.requestedByAgentId !== req.actor.agentId) {
        throw forbidden("Only the requesting agent can send this deploy maintenance message");
      }
      if (!deploymentTarget || deploymentTarget.companyId !== project.companyId) {
        res.status(404).json({ error: "Deployment target not found" });
        return;
      }
      if (!deploymentTarget.maintenanceUpdatesEnabled) {
        res.status(422).json({ error: "Maintenance updates are not enabled for this deployment target" });
        return;
      }
      const recipients = deploymentTarget.maintenanceRecipients.filter((value) => value.trim().length > 0);
      if (recipients.length === 0) {
        res.status(422).json({ error: "Deployment target has no maintenance recipients" });
        return;
      }
      const allowedStatuses = new Set(["deploying", "deployed", "failed", "rolled_back"]);
      if (!allowedStatuses.has(deployEvent.status)) {
        res.status(422).json({ error: `Cannot send maintenance message for deploy event status ${deployEvent.status}` });
        return;
      }
      const message = String(req.body.message ?? deployEvent.maintenanceMessage ?? "").trim();
      if (!message) {
        res.status(422).json({ error: "Maintenance message is required" });
        return;
      }

      const result = await sendProjectDeployMaintenanceEmailWithResult({
        to: recipients,
        projectName: project.name,
        targetName: deploymentTarget.name,
        targetEnvironment: deploymentTarget.environment,
        deployStatus: deployEvent.status,
        message,
        issueIdentifier: issue?.identifier ?? null,
        issueTitle: issue?.title ?? null,
        approvalId: approval.id,
        deployEventId: deployEvent.id,
        db,
        companyId: project.companyId,
      });
      const updated = await svc.recordDeployMaintenanceMessageDelivery(id, deployEvent.id, {
        status: result.status === "sent" ? "sent" : result.status === "skipped" ? "skipped" : "failed",
        recipients,
        sentAt: result.status === "sent" ? new Date() : null,
        error:
          result.status === "failed"
            ? result.error
            : result.status === "skipped"
              ? result.reason
              : null,
      });

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId: project.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "project.deploy_maintenance_message_attempted",
        entityType: "project",
        entityId: project.id,
        details: {
          deployEventId: deployEvent.id,
          approvalId: approval.id,
          status: result.status,
          recipientCount: recipients.length,
          error: result.status === "failed" ? result.error : result.status === "skipped" ? result.reason : null,
        },
      });

      res.json(updated ?? deployEvent);
    },
  );

  router.get("/projects/:id/deploy-events/:deployEventId/command-records", async (req, res) => {
    const id = req.params.id as string;
    const deployEventId = req.params.deployEventId as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, project.companyId);
    const deployEvent = await svc.getDeployEvent(id, deployEventId);
    if (!deployEvent || deployEvent.companyId !== project.companyId) {
      res.status(404).json({ error: "Deploy event not found" });
      return;
    }
    res.json(await svc.listDeployCommandRecords(id, deployEvent.id));
  });

  router.post(
    "/projects/:id/deploy-events/:deployEventId/command-records",
    validate(createProjectDeployCommandRecordSchema),
    async (req, res) => {
      const id = req.params.id as string;
      const deployEventId = req.params.deployEventId as string;
      const project = await svc.getById(id);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      assertCompanyAccess(req, project.companyId);

      const deployEvent = await svc.getDeployEvent(id, deployEventId);
      if (!deployEvent || deployEvent.companyId !== project.companyId) {
        res.status(404).json({ error: "Deploy event not found" });
        return;
      }
      if (!deployEvent.approvalId) {
        res.status(422).json({ error: "Deploy event is not linked to an approval" });
        return;
      }
      if (!deployEvent.deploymentTargetId) {
        res.status(422).json({ error: "Deploy event is not linked to a deployment target" });
        return;
      }

      const [approval, deploymentTarget] = await Promise.all([
        approvalsSvc.getById(deployEvent.approvalId),
        svc.getDeploymentTarget(id, deployEvent.deploymentTargetId),
      ]);
      if (!approval || approval.companyId !== project.companyId || approval.type !== "deploy_change") {
        res.status(404).json({ error: "Deploy approval not found" });
        return;
      }
      if (approval.status !== "approved") {
        res.status(422).json({ error: "Deploy command records require approved deploy approval" });
        return;
      }
      if (req.actor.type === "agent" && approval.requestedByAgentId !== req.actor.agentId) {
        throw forbidden("Only the requesting agent can record deploy command evidence");
      }
      if (!deploymentTarget || deploymentTarget.companyId !== project.companyId) {
        res.status(404).json({ error: "Deployment target not found" });
        return;
      }
      const commandType = req.body.commandType as "deploy" | "rollback";
      const configuredCommand = commandType === "deploy" ? deploymentTarget.deployCommand : deploymentTarget.rollbackCommand;
      if (!configuredCommand || configuredCommand.trim() !== req.body.command.trim()) {
        res.status(422).json({ error: `${commandType} command must match the approved deployment target descriptor` });
        return;
      }
      if (commandType === "deploy" && !new Set(["approved", "deploying", "failed"]).has(deployEvent.status)) {
        res.status(422).json({ error: `Cannot record deploy command for deploy event status ${deployEvent.status}` });
        return;
      }
      if (commandType === "rollback" && !new Set(["deployed", "failed", "rolled_back"]).has(deployEvent.status)) {
        res.status(422).json({ error: `Cannot record rollback command for deploy event status ${deployEvent.status}` });
        return;
      }

      const actor = getActorInfo(req);
      const record = await svc.createDeployCommandRecord(project.id, {
        deployEventId: deployEvent.id,
        deploymentTargetId: deploymentTarget.id,
        approvalId: approval.id,
        commandType,
        status: req.body.status,
        command: req.body.command,
        output: req.body.output ?? null,
        exitCode: req.body.exitCode ?? null,
        note: req.body.note ?? null,
        recordedByAgentId: actor.actorType === "agent" ? actor.actorId : null,
        recordedByUserId: actor.actorType === "user" ? actor.actorId : null,
      });
      if (!record) {
        res.status(422).json({ error: "Invalid deploy command record payload" });
        return;
      }

      const nextEventStatus = deployEventStatusForCommandRecord(commandType, record.status);
      const updatedDeployEvent = nextEventStatus && nextEventStatus !== deployEvent.status
        ? await svc.updateDeployEventStatus(id, deployEvent.id, {
            status: nextEventStatus,
            note: `Deploy command evidence recorded: ${record.commandType} ${record.status}`,
            maintenanceMessage: null,
            metadata: {
              commandRecordId: record.id,
              commandType: record.commandType,
              commandStatus: record.status,
            },
            actor,
          })
        : null;

      await logActivity(db, {
        companyId: project.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "project.deploy_command_recorded",
        entityType: "project",
        entityId: project.id,
        details: {
          deployEventId: deployEvent.id,
          approvalId: approval.id,
          commandRecordId: record.id,
          commandType: record.commandType,
          status: record.status,
          exitCode: record.exitCode,
          deployEventStatus: updatedDeployEvent?.status ?? deployEvent.status,
        },
      });

      res.status(201).json(record);
    },
  );

  router.post("/projects/:id/deploy-approvals", validate(createProjectDeployApprovalSchema), async (req, res) => {
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, project.companyId);

    const body = req.body as {
      issueId: string;
      deploymentTargetId: string;
      summary: string;
      changedFiles: string[];
      testsRun: string[];
      rollbackPlan: string;
      risk?: string | null;
      maintenanceMessage?: string | null;
      metadata?: Record<string, unknown> | null;
    };
    const [issue, deploymentTarget] = await Promise.all([
      issuesSvc.getById(body.issueId),
      svc.getDeploymentTarget(id, body.deploymentTargetId),
    ]);
    if (!issue || issue.companyId !== project.companyId) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    if (issue.projectId !== project.id) {
      res.status(422).json({ error: "Deploy approval issue must belong to this project" });
      return;
    }
    if (!deploymentTarget || deploymentTarget.companyId !== project.companyId) {
      res.status(404).json({ error: "Deployment target not found" });
      return;
    }
    if (deploymentTarget.status !== "active") {
      res.status(422).json({ error: "Deployment target is disabled" });
      return;
    }

    const actor = getActorInfo(req);
    const approval = await approvalsSvc.create(project.companyId, {
      type: "deploy_change",
      requestedByAgentId: actor.actorType === "agent" ? actor.actorId : null,
      requestedByUserId: actor.actorType === "user" ? actor.actorId : null,
      status: "pending",
      payload: {
        source: "project_deploy_workflow",
        project: {
          id: project.id,
          name: project.name,
          urlKey: project.urlKey,
        },
        issue: {
          id: issue.id,
          identifier: issue.identifier ?? null,
          title: issue.title,
          status: issue.status,
          priority: issue.priority,
          originKind: issue.originKind ?? null,
          originId: issue.originId ?? null,
        },
        deploymentTarget: {
          id: deploymentTarget.id,
          name: deploymentTarget.name,
          environment: deploymentTarget.environment,
          provider: deploymentTarget.provider,
          targetUrl: deploymentTarget.targetUrl,
          healthCheckUrl: deploymentTarget.healthCheckUrl,
        },
        summary: body.summary,
        changedFiles: body.changedFiles,
        testsRun: body.testsRun,
        risk: body.risk ?? null,
        rollbackPlan: body.rollbackPlan,
        maintenanceMessage: body.maintenanceMessage ?? null,
        requestedAt: new Date().toISOString(),
        metadata: body.metadata ?? null,
      },
      decisionNote: null,
      decidedByUserId: null,
      decidedAt: null,
      updatedAt: new Date(),
    });

    await issueApprovalsSvc.linkManyForApproval(approval.id, [issue.id], {
      agentId: actor.agentId,
      userId: actor.actorType === "user" ? actor.actorId : null,
    });

    const deployEvent = await svc.createDeployEvent(project.id, {
      deploymentTargetId: deploymentTarget.id,
      issueId: issue.id,
      approvalId: approval.id,
      status: "approval_requested",
      summary: body.summary,
      changedFiles: body.changedFiles,
      testsRun: body.testsRun,
      rollbackPlan: body.rollbackPlan,
      maintenanceMessage: body.maintenanceMessage ?? null,
      metadata: {
        risk: body.risk ?? null,
        requestMetadata: body.metadata ?? null,
      },
      createdByAgentId: actor.actorType === "agent" ? actor.actorId : null,
      createdByUserId: actor.actorType === "user" ? actor.actorId : null,
    });

    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.deploy_approval_requested",
      entityType: "project",
      entityId: project.id,
      details: {
        approvalId: approval.id,
        deployEventId: deployEvent?.id ?? null,
        issueId: issue.id,
        deploymentTargetId: deploymentTarget.id,
        environment: deploymentTarget.environment,
      },
    });

    res.status(201).json({ approval, deployEvent });
  });

  router.get("/projects/:id/workspaces", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    const workspaces = await svc.listWorkspaces(id);
    res.json(workspaces);
  });

  router.post("/projects/:id/workspaces", validate(createProjectWorkspaceSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    assertNoAgentHostWorkspaceCommandMutation(
      req,
      collectProjectWorkspaceCommandPaths(req.body),
    );
    const workspace = await svc.createWorkspace(id, req.body);
    if (!workspace) {
      res.status(422).json({ error: "Invalid project workspace payload" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.workspace_created",
      entityType: "project",
      entityId: id,
      details: {
        workspaceId: workspace.id,
        name: workspace.name,
        cwd: workspace.cwd,
        isPrimary: workspace.isPrimary,
      },
    });

    res.status(201).json(workspace);
  });

  router.patch(
    "/projects/:id/workspaces/:workspaceId",
    validate(updateProjectWorkspaceSchema),
    async (req, res) => {
      const id = req.params.id as string;
      const workspaceId = req.params.workspaceId as string;
      const existing = await svc.getById(id);
      if (!existing) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      assertCompanyAccess(req, existing.companyId);
      assertNoAgentHostWorkspaceCommandMutation(
        req,
        collectProjectWorkspaceCommandPaths(req.body),
      );
      const workspaceExists = (await svc.listWorkspaces(id)).some((workspace) => workspace.id === workspaceId);
      if (!workspaceExists) {
        res.status(404).json({ error: "Project workspace not found" });
        return;
      }
      const workspace = await svc.updateWorkspace(id, workspaceId, req.body);
      if (!workspace) {
        res.status(422).json({ error: "Invalid project workspace payload" });
        return;
      }

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId: existing.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "project.workspace_updated",
        entityType: "project",
        entityId: id,
        details: {
          workspaceId: workspace.id,
          changedKeys: Object.keys(req.body).sort(),
        },
      });

      res.json(workspace);
    },
  );

  async function handleProjectWorkspaceRuntimeCommand(req: Request, res: Response) {
    const id = req.params.id as string;
    const workspaceId = req.params.workspaceId as string;
    const action = String(req.params.action ?? "").trim().toLowerCase();
    if (action !== "start" && action !== "stop" && action !== "restart" && action !== "run") {
      res.status(404).json({ error: "Workspace command action not found" });
      return;
    }

    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, project.companyId);

    const workspace = project.workspaces.find((entry) => entry.id === workspaceId) ?? null;
    if (!workspace) {
      res.status(404).json({ error: "Project workspace not found" });
      return;
    }

    const isSharedWorkspace = Boolean(workspace.sharedWorkspaceKey);
    if (
      req.actor.type === "agent"
      && isSharedWorkspace
      && SHARED_WORKSPACE_STOP_AND_RESTART_ACTIONS.has(action)
    ) {
      throw forbidden("Missing permission to manage workspace runtime services");
    }

    await assertCanManageProjectWorkspaceRuntimeServices(db, req, {
      companyId: project.companyId,
      projectWorkspaceId: workspace.id,
    });

    const workspaceCwd = workspace.cwd;
    if (!workspaceCwd) {
      res.status(422).json({ error: "Project workspace needs a local path before Paperclip can run workspace commands" });
      return;
    }

    const runtimeConfig = workspace.runtimeConfig?.workspaceRuntime ?? null;
    const target = req.body as { workspaceCommandId?: string | null; runtimeServiceId?: string | null; serviceIndex?: number | null };
    const configuredServices = runtimeConfig ? listConfiguredRuntimeServiceEntries({ workspaceRuntime: runtimeConfig }) : [];
    const workspaceCommand = runtimeConfig
      ? findWorkspaceCommandDefinition(runtimeConfig, target.workspaceCommandId ?? null)
      : null;
    if (target.workspaceCommandId && !workspaceCommand) {
      res.status(404).json({ error: "Workspace command not found for this project workspace" });
      return;
    }
    if (target.runtimeServiceId && !(workspace.runtimeServices ?? []).some((service) => service.id === target.runtimeServiceId)) {
      res.status(404).json({ error: "Runtime service not found for this project workspace" });
      return;
    }
    const matchedRuntimeService =
      workspaceCommand?.kind === "service" && !target.runtimeServiceId
        ? matchWorkspaceRuntimeServiceToCommand(workspaceCommand, workspace.runtimeServices ?? [])
        : null;
    const selectedRuntimeServiceId = target.runtimeServiceId ?? matchedRuntimeService?.id ?? null;
    const selectedServiceIndex =
      workspaceCommand?.kind === "service"
        ? workspaceCommand.serviceIndex
        : target.serviceIndex ?? null;
    if (
      selectedServiceIndex !== undefined
      && selectedServiceIndex !== null
      && (selectedServiceIndex < 0 || selectedServiceIndex >= configuredServices.length)
    ) {
      res.status(422).json({ error: "Selected runtime service is not defined in this project workspace runtime config" });
      return;
    }
    if (workspaceCommand?.kind === "job" && action !== "run") {
      res.status(422).json({ error: `Workspace job "${workspaceCommand.name}" can only be run` });
      return;
    }
    if (workspaceCommand?.kind === "service" && action === "run") {
      res.status(422).json({ error: `Workspace service "${workspaceCommand.name}" should be started or restarted, not run` });
      return;
    }
    if (action === "run" && !workspaceCommand) {
      res.status(422).json({ error: "Select a workspace job to run" });
      return;
    }
    if ((action === "start" || action === "restart") && !runtimeConfig) {
      res.status(422).json({ error: "Project workspace has no workspace command configuration" });
      return;
    }

    const actor = getActorInfo(req);
    const recorder = workspaceOperations.createRecorder({ companyId: project.companyId });
    let runtimeServiceCount = workspace.runtimeServices?.length ?? 0;
    let stdout = "";
    let stderr = "";

    const operation = await recorder.recordOperation({
      phase: action === "stop" ? "workspace_teardown" : "workspace_provision",
      command: workspaceCommand?.command ?? `workspace command ${action}`,
      cwd: workspace.cwd,
      metadata: {
        action,
        projectId: project.id,
        projectWorkspaceId: workspace.id,
        workspaceCommandId: workspaceCommand?.id ?? target.workspaceCommandId ?? null,
        workspaceCommandKind: workspaceCommand?.kind ?? null,
        workspaceCommandName: workspaceCommand?.name ?? null,
        runtimeServiceId: selectedRuntimeServiceId,
        serviceIndex: selectedServiceIndex,
      },
      run: async () => {
        if (action === "run") {
          if (!workspaceCommand || workspaceCommand.kind !== "job") {
            throw new Error("Workspace job selection is required");
          }
          return await runWorkspaceJobForControl({
            actor: {
              id: actor.agentId ?? null,
              name: actor.actorType === "user" ? "Board" : "Agent",
              companyId: project.companyId,
            },
            issue: null,
            workspace: {
              baseCwd: workspaceCwd,
              source: "project_primary",
              projectId: project.id,
              workspaceId: workspace.id,
              repoUrl: workspace.repoUrl,
              repoRef: workspace.repoRef,
              strategy: "project_primary",
              cwd: workspaceCwd,
              branchName: workspace.defaultRef ?? workspace.repoRef ?? null,
              worktreePath: null,
              warnings: [],
              created: false,
            },
            command: workspaceCommand.rawConfig,
            adapterEnv: {},
            recorder,
            metadata: {
              action,
              projectId: project.id,
              projectWorkspaceId: workspace.id,
              workspaceCommandId: workspaceCommand.id,
            },
          }).then((nestedOperation) => ({
            status: "succeeded" as const,
            exitCode: 0,
            metadata: {
              nestedOperationId: nestedOperation?.id ?? null,
              runtimeServiceCount,
            },
          }));
        }

        const onLog = async (stream: "stdout" | "stderr", chunk: string) => {
          if (stream === "stdout") stdout = appendWithCap(stdout, chunk, WORKSPACE_CONTROL_OUTPUT_MAX_CHARS);
          else stderr = appendWithCap(stderr, chunk, WORKSPACE_CONTROL_OUTPUT_MAX_CHARS);
        };

        if (action === "stop" || action === "restart") {
          await stopRuntimeServicesForProjectWorkspace({
            db,
            projectWorkspaceId: workspace.id,
            runtimeServiceId: selectedRuntimeServiceId,
          });
        }

        if (action === "start" || action === "restart") {
          const startedServices = await startRuntimeServicesForWorkspaceControl({
            db,
            actor: {
              id: actor.agentId ?? null,
              name: actor.actorType === "user" ? "Board" : "Agent",
              companyId: project.companyId,
            },
            issue: null,
            workspace: {
              baseCwd: workspaceCwd,
              source: "project_primary",
              projectId: project.id,
              workspaceId: workspace.id,
              repoUrl: workspace.repoUrl,
              repoRef: workspace.repoRef,
              strategy: "project_primary",
              cwd: workspaceCwd,
              branchName: workspace.defaultRef ?? workspace.repoRef ?? null,
              worktreePath: null,
              warnings: [],
              created: false,
            },
            config: { workspaceRuntime: runtimeConfig },
            adapterEnv: {},
            onLog,
            serviceIndex: selectedServiceIndex,
          });
          runtimeServiceCount = startedServices.length;
        } else {
          runtimeServiceCount = selectedRuntimeServiceId ? Math.max(0, (workspace.runtimeServices?.length ?? 1) - 1) : 0;
        }

        const currentDesiredState: WorkspaceRuntimeDesiredState =
          workspace.runtimeConfig?.desiredState
          ?? ((workspace.runtimeServices ?? []).some((service) => service.status === "starting" || service.status === "running")
            ? "running"
            : "stopped");
        const nextRuntimeState: {
          desiredState: WorkspaceRuntimeDesiredState;
          serviceStates: WorkspaceRuntimeServiceStateMap | null | undefined;
        } = selectedRuntimeServiceId && (selectedServiceIndex === undefined || selectedServiceIndex === null)
          ? {
              desiredState: currentDesiredState,
              serviceStates: workspace.runtimeConfig?.serviceStates ?? null,
            }
          : buildWorkspaceRuntimeDesiredStatePatch({
              config: { workspaceRuntime: runtimeConfig },
              currentDesiredState,
              currentServiceStates: workspace.runtimeConfig?.serviceStates ?? null,
              action,
              serviceIndex: selectedServiceIndex,
            });
        await svc.updateWorkspace(project.id, workspace.id, {
          runtimeConfig: {
            desiredState: nextRuntimeState.desiredState,
            serviceStates: nextRuntimeState.serviceStates,
          },
        });

        return {
          status: "succeeded",
          stdout,
          stderr,
          system:
            action === "stop"
              ? "Stopped project workspace runtime services.\nThis does not pause issue work or held wake scheduling."
              : action === "restart"
                ? "Restarted project workspace runtime services.\nThis does not pause issue work or held wake scheduling."
                : "Started project workspace runtime services.\n",
          metadata: {
            runtimeServiceCount,
            workspaceCommandId: workspaceCommand?.id ?? target.workspaceCommandId ?? null,
            runtimeServiceId: selectedRuntimeServiceId,
            serviceIndex: selectedServiceIndex,
          },
        };
      },
    });

    const updatedWorkspace = (await svc.listWorkspaces(project.id)).find((entry) => entry.id === workspace.id) ?? workspace;

    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: `project.workspace_runtime_${action}`,
      entityType: "project",
      entityId: project.id,
      details: {
        projectWorkspaceId: workspace.id,
        runtimeServiceCount,
        workspaceCommandId: workspaceCommand?.id ?? target.workspaceCommandId ?? null,
        workspaceCommandKind: workspaceCommand?.kind ?? null,
        workspaceCommandName: workspaceCommand?.name ?? null,
        runtimeServiceId: selectedRuntimeServiceId,
        serviceIndex: selectedServiceIndex,
      },
    });

    res.json({
      workspace: updatedWorkspace,
      operation,
    });
  }

  router.post("/projects/:id/workspaces/:workspaceId/runtime-services/:action", validate(workspaceRuntimeControlTargetSchema), handleProjectWorkspaceRuntimeCommand);
  router.post("/projects/:id/workspaces/:workspaceId/runtime-commands/:action", validate(workspaceRuntimeControlTargetSchema), handleProjectWorkspaceRuntimeCommand);

  router.delete("/projects/:id/workspaces/:workspaceId", async (req, res) => {
    const id = req.params.id as string;
    const workspaceId = req.params.workspaceId as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    const workspace = await svc.removeWorkspace(id, workspaceId);
    if (!workspace) {
      res.status(404).json({ error: "Project workspace not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.workspace_deleted",
      entityType: "project",
      entityId: id,
      details: {
        workspaceId: workspace.id,
        name: workspace.name,
      },
    });

    res.json(workspace);
  });

  router.get("/projects/:id/files", async (req, res) => {
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertBoard(req);
    assertCompanyAccess(req, project.companyId);
    res.json(await filesSvc.getSummary(id));
  });

  router.get("/projects/:id/files/tree", async (req, res) => {
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertBoard(req);
    assertCompanyAccess(req, project.companyId);
    const query = projectFilesPathSchema.parse(req.query);
    res.json(await filesSvc.listTree(id, query.path, query.showIgnored));
  });

  router.get("/projects/:id/files/content", async (req, res) => {
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertBoard(req);
    assertCompanyAccess(req, project.companyId);
    const query = projectFileReadSchema.parse(req.query);
    res.json(await filesSvc.readFile(id, query.path));
  });

  router.put("/projects/:id/files/content", validate(projectFileSaveSchema), async (req, res) => {
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertBoard(req);
    assertCompanyAccess(req, project.companyId);
    const result = await filesSvc.saveFile(id, req.body.path, req.body.content);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.file_saved",
      entityType: "project",
      entityId: id,
      details: { path: req.body.path },
    });
    res.json(result);
  });

  router.post("/projects/:id/files/tree/file", validate(projectFileCreateSchema), async (req, res) => {
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertBoard(req);
    assertCompanyAccess(req, project.companyId);
    const result = await filesSvc.createFile(id, req.body.path);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.file_created",
      entityType: "project",
      entityId: id,
      details: { path: req.body.path },
    });
    res.status(201).json(result);
  });

  router.post("/projects/:id/files/tree/folder", validate(projectFileCreateSchema), async (req, res) => {
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertBoard(req);
    assertCompanyAccess(req, project.companyId);
    const result = await filesSvc.createFolder(id, req.body.path);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.folder_created",
      entityType: "project",
      entityId: id,
      details: { path: req.body.path },
    });
    res.status(201).json(result);
  });

  router.patch("/projects/:id/files/tree", validate(projectFileRenameSchema), async (req, res) => {
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertBoard(req);
    assertCompanyAccess(req, project.companyId);
    const result = await filesSvc.renamePath(id, req.body.path, req.body.nextPath);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.path_renamed",
      entityType: "project",
      entityId: id,
      details: { path: req.body.path, nextPath: req.body.nextPath },
    });
    res.json(result);
  });

  router.delete("/projects/:id/files/tree", async (req, res) => {
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertBoard(req);
    assertCompanyAccess(req, project.companyId);
    const query = projectFileDeleteSchema.parse(req.query);
    const result = await filesSvc.deletePath(id, query.path);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.path_deleted",
      entityType: "project",
      entityId: id,
      details: { path: query.path },
    });
    res.json(result);
  });

  router.post("/projects/:id/files/branch", validate(projectFileBranchSwitchSchema), async (req, res) => {
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertBoard(req);
    assertCompanyAccess(req, project.companyId);
    const result = await filesSvc.switchBranch(id, req.body.branch, req.body.mode);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.branch_switched",
      entityType: "project",
      entityId: id,
      details: { branch: req.body.branch, mode: req.body.mode },
    });
    res.json(result);
  });

  router.post("/projects/:id/files/branch/create", validate(projectFileBranchCreateSchema), async (req, res) => {
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertBoard(req);
    assertCompanyAccess(req, project.companyId);
    const result = await filesSvc.createBranch(id, req.body.name, req.body.startPoint);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.branch_created",
      entityType: "project",
      entityId: id,
      details: { name: req.body.name, startPoint: req.body.startPoint ?? null },
    });
    res.status(201).json(result);
  });

  router.delete("/projects/:id/files/branch", async (req, res) => {
    const id = req.params.id as string;
    const name = req.query.name as string | undefined;
    const force = req.query.force === "true";
    if (!name) {
      res.status(400).json({ error: "Branch name is required" });
      return;
    }
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertBoard(req);
    assertCompanyAccess(req, project.companyId);
    const result = await filesSvc.deleteBranch(id, name, force);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.branch_deleted",
      entityType: "project",
      entityId: id,
      details: { name, force },
    });
    res.json(result);
  });

  router.post("/projects/:id/files/sync", async (req, res) => {
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertBoard(req);
    assertCompanyAccess(req, project.companyId);
    const result = await filesSvc.sync(id);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.git_synced",
      entityType: "project",
      entityId: id,
      details: { status: result.status, branch: result.summary.currentBranch },
    });
    res.json(result);
  });

  router.post("/projects/:id/files/branches/sync", async (req, res) => {
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertBoard(req);
    assertCompanyAccess(req, project.companyId);
    const result = await filesSvc.syncBranches(id);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.branches_synced",
      entityType: "project",
      entityId: id,
      details: {
        status: result.status,
        branchesSynced: result.details.filter(
          (d) => d.action !== "error" && d.action !== "remote_deleted_local_remains",
        ).length,
        branchesWithDeletedUpstream: result.details.filter((d) => d.action === "remote_deleted_local_remains").length,
        errors: result.details.filter((d) => d.action === "error").length,
      },
    });
    res.json(result);
  });

  router.post("/projects/:id/files/branch/push", validate(projectFileBranchPushSchema), async (req, res) => {
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertBoard(req);
    assertCompanyAccess(req, project.companyId);
    const result = await filesSvc.pushBranch(id, req.body.name);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.branch_pushed",
      entityType: "project",
      entityId: id,
      details: { name: req.body.name, status: result.status },
    });
    res.json(result);
  });

  router.post("/projects/:id/files/publish-remote", async (req, res) => {
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertBoard(req);
    assertCompanyAccess(req, project.companyId);
    const { remoteUrl } = req.body as { remoteUrl?: string };
    if (!remoteUrl || typeof remoteUrl !== "string" || !remoteUrl.trim()) {
      res.status(400).json({ error: "remoteUrl is required" });
      return;
    }
    const result = await filesSvc.publishToRemote(id, remoteUrl.trim());
    if (result.status === "success" && project.primaryWorkspace) {
      await svc.updateWorkspace(id, project.primaryWorkspace.id, { repoUrl: remoteUrl.trim() });
    }
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.published_to_remote",
      entityType: "project",
      entityId: id,
      details: { remoteUrl: remoteUrl.trim(), status: result.status },
    });
    res.json(result);
  });

  router.get("/projects/:id/files/git-status", async (req, res) => {
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    assertBoard(req);
    assertCompanyAccess(req, project.companyId);
    const result = await filesSvc.getGitStatus(id);
    res.json(result);
  });

  router.post("/projects/:id/files/git-stage", async (req, res) => {
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    assertBoard(req);
    assertCompanyAccess(req, project.companyId);
    const { paths } = req.body as { paths?: unknown };
    if (!Array.isArray(paths) || paths.length === 0) {
      res.status(400).json({ error: "paths array is required" }); return;
    }
    const result = await filesSvc.stageFiles(id, paths.map(String));
    res.json(result);
  });

  router.post("/projects/:id/files/git-unstage", async (req, res) => {
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    assertBoard(req);
    assertCompanyAccess(req, project.companyId);
    const { paths } = req.body as { paths?: unknown };
    if (!Array.isArray(paths) || paths.length === 0) {
      res.status(400).json({ error: "paths array is required" }); return;
    }
    const result = await filesSvc.unstageFiles(id, paths.map(String));
    res.json(result);
  });

  router.post("/projects/:id/files/git-commit", async (req, res) => {
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    assertBoard(req);
    assertCompanyAccess(req, project.companyId);
    const { message } = req.body as { message?: string };
    if (!message || typeof message !== "string" || !message.trim()) {
      res.status(400).json({ error: "message is required" }); return;
    }
    const result = await filesSvc.commitStaged(id, message);
    res.json(result);
  });

  router.get("/projects/:id/files/git-diff", async (req, res) => {
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    assertBoard(req);
    assertCompanyAccess(req, project.companyId);
    const filePath = req.query.path as string | undefined;
    if (!filePath) { res.status(400).json({ error: "path is required" }); return; }
    const staged = req.query.staged === "true";
    const result = await filesSvc.getFileDiff(id, filePath, staged);
    res.json(result);
  });

  router.post("/projects/:id/files/git-discard", async (req, res) => {
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    assertBoard(req);
    assertCompanyAccess(req, project.companyId);
    const { paths } = req.body as { paths?: unknown };
    if (!Array.isArray(paths) || paths.length === 0) {
      res.status(400).json({ error: "paths array is required" }); return;
    }
    const result = await filesSvc.discardFiles(id, paths.map(String));
    res.json(result);
  });

  router.post("/projects/:id/files/git-push", async (req, res) => {
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    assertBoard(req);
    assertCompanyAccess(req, project.companyId);
    const result = await filesSvc.pushFiles(id);
    res.json(result);
  });

  router.delete("/projects/:id", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    const project = await svc.remove(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.deleted",
      entityType: "project",
      entityId: project.id,
    });

    res.json(project);
  });

  return router;
}
