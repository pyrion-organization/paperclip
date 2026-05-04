import { Router, type Request, type Response } from "express";
import type { Db } from "@paperclipai/db";
import {
  createProjectSchema,
  projectFileBranchCreateSchema,
  projectFileBranchSwitchSchema,
  projectFileCreateSchema,
  projectFileDeleteSchema,
  projectFileReadSchema,
  projectFileRenameSchema,
  projectFileSaveSchema,
  projectFilesPathSchema,
  createProjectWorkspaceSchema,
  findWorkspaceCommandDefinition,
  isUuidLike,
  matchWorkspaceRuntimeServiceToCommand,
  updateProjectSchema,
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
import { getTelemetryClient } from "../telemetry.js";
import { appendWithCap } from "../adapters/utils.js";
import { assertEnvironmentSelectionForCompany } from "./environment-selection.js";
import { environmentService } from "../services/environments.js";
import { secretService } from "../services/secrets.js";

const WORKSPACE_CONTROL_OUTPUT_MAX_CHARS = 256 * 1024;
const SHARED_WORKSPACE_STOP_AND_RESTART_ACTIONS = new Set(["stop", "restart"]);

export function projectRoutes(db: Db) {
  const router = Router();
  const svc = projectService(db);
  const filesSvc = projectFilesService(db);
  const secretsSvc = secretService(db);
  const workspaceOperations = workspaceOperationService(db);
  const strictSecretsMode = process.env.PAPERCLIP_SECRETS_STRICT_MODE === "true";
  const environmentsSvc = environmentService(db);

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

  router.param("id", async (req, _res, next, rawId) => {
    try {
      req.params.id = await normalizeProjectReference(req, rawId);
      next();
    } catch (err) {
      next(err);
    }
  });

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
