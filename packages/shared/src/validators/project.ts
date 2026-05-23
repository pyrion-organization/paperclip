import { z } from "zod";
import {
  PROJECT_DEPLOY_COMMAND_STATUSES,
  PROJECT_DEPLOY_COMMAND_TYPES,
  PROJECT_DEPLOYMENT_TARGET_STATUSES,
  PROJECT_INFRA_HEALTH_CHECK_TYPES,
  PROJECT_INFRA_HEALTH_STATUSES,
  PROJECT_INFRA_ACTION_EVIDENCE_STATUSES,
  PROJECT_INFRA_ACTION_TYPES,
  PROJECT_INFRA_INCIDENT_SEVERITIES,
  PROJECT_INFRA_INCIDENT_STATUSES,
  PROJECT_INFRA_TARGET_STATUSES,
  PROJECT_STATUSES,
} from "../constants.js";
import { envConfigSchema } from "./secret.js";

const optionalTrimmedText = (max = 4000) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim().length === 0 ? null : value),
    z.string().trim().max(max).optional().nullable(),
  );

const optionalUrlSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim().length === 0 ? null : value),
  z.string().trim().url().optional().nullable(),
);

const deployEvidenceListSchema = z
  .array(z.string().trim().min(1).max(500))
  .max(100)
  .default([]);

const deployMaintenanceRecipientsSchema = z
  .array(z.string().trim().email().max(320))
  .max(25)
  .default([]);

const executionWorkspaceStrategySchema = z
  .object({
    type: z.enum(["project_primary", "git_worktree", "adapter_managed", "cloud_sandbox"]).optional(),
    baseRef: z.string().optional().nullable(),
    branchTemplate: z.string().optional().nullable(),
    worktreeParentDir: z.string().optional().nullable(),
    provisionCommand: z.string().optional().nullable(),
    teardownCommand: z.string().optional().nullable(),
  })
  .strict();

export const projectExecutionWorkspacePolicySchema = z
  .object({
    enabled: z.boolean(),
    defaultMode: z.enum(["shared_workspace", "isolated_workspace", "operator_branch", "adapter_default"]).optional(),
    allowIssueOverride: z.boolean().optional(),
    defaultProjectWorkspaceId: z.string().uuid().optional().nullable(),
    environmentId: z.string().uuid().optional().nullable(),
    workspaceStrategy: executionWorkspaceStrategySchema.optional().nullable(),
    workspaceRuntime: z.record(z.unknown()).optional().nullable(),
    branchPolicy: z.record(z.unknown()).optional().nullable(),
    pullRequestPolicy: z.record(z.unknown()).optional().nullable(),
    runtimePolicy: z.record(z.unknown()).optional().nullable(),
    cleanupPolicy: z.record(z.unknown()).optional().nullable(),
  })
  .strict();

export const projectWorkspaceRuntimeConfigSchema = z.object({
  workspaceRuntime: z.record(z.unknown()).optional().nullable(),
  desiredState: z.enum(["running", "stopped", "manual"]).optional().nullable(),
  serviceStates: z.record(z.enum(["running", "stopped", "manual"])).optional().nullable(),
}).strict();

const projectWorkspaceSourceTypeSchema = z.enum(["local_path", "git_repo", "remote_managed", "non_git_path"]);
const projectWorkspaceVisibilitySchema = z.enum(["default", "advanced"]);

const projectWorkspaceFields = {
  name: z.string().min(1).optional(),
  sourceType: projectWorkspaceSourceTypeSchema.optional(),
  cwd: z.string().min(1).optional().nullable(),
  repoUrl: z.string().url().optional().nullable(),
  repoRef: z.string().optional().nullable(),
  defaultRef: z.string().optional().nullable(),
  visibility: projectWorkspaceVisibilitySchema.optional(),
  setupCommand: z.string().optional().nullable(),
  cleanupCommand: z.string().optional().nullable(),
  remoteProvider: z.string().optional().nullable(),
  remoteWorkspaceRef: z.string().optional().nullable(),
  sharedWorkspaceKey: z.string().optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
  runtimeConfig: projectWorkspaceRuntimeConfigSchema.optional().nullable(),
};

function validateProjectWorkspace(value: Record<string, unknown>, ctx: z.RefinementCtx) {
  const sourceType = value.sourceType ?? "local_path";
  const hasCwd = typeof value.cwd === "string" && value.cwd.trim().length > 0;
  const hasRepo = typeof value.repoUrl === "string" && value.repoUrl.trim().length > 0;
  const hasRemoteRef = typeof value.remoteWorkspaceRef === "string" && value.remoteWorkspaceRef.trim().length > 0;

  if (sourceType === "remote_managed") {
    if (!hasRemoteRef && !hasRepo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Remote-managed workspace requires remoteWorkspaceRef or repoUrl.",
        path: ["remoteWorkspaceRef"],
      });
    }
    return;
  }

  if (!hasCwd && !hasRepo) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Workspace requires at least one of cwd or repoUrl.",
      path: ["cwd"],
    });
  }
}

export const createProjectWorkspaceSchema = z.object({
  ...projectWorkspaceFields,
  isPrimary: z.boolean().optional().default(false),
}).superRefine(validateProjectWorkspace);

export type CreateProjectWorkspace = z.infer<typeof createProjectWorkspaceSchema>;

export const updateProjectWorkspaceSchema = z.object({
  ...projectWorkspaceFields,
  isPrimary: z.boolean().optional(),
}).partial();

export type UpdateProjectWorkspace = z.infer<typeof updateProjectWorkspaceSchema>;

const projectFields = {
  /** @deprecated Use goalIds instead */
  goalId: z.string().uuid().optional().nullable(),
  goalIds: z.array(z.string().uuid()).optional(),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  status: z.enum(PROJECT_STATUSES).optional().default("backlog"),
  leadAgentId: z.string().uuid().optional().nullable(),
  targetDate: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  env: envConfigSchema.optional().nullable(),
  executionWorkspacePolicy: projectExecutionWorkspacePolicySchema.optional().nullable(),
  archivedAt: z.string().datetime().optional().nullable(),
};

export const createProjectSchema = z.object({
  ...projectFields,
  workspace: createProjectWorkspaceSchema.optional(),
});

export type CreateProject = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z.object(projectFields).partial();

export type UpdateProject = z.infer<typeof updateProjectSchema>;

export type ProjectExecutionWorkspacePolicy = z.infer<typeof projectExecutionWorkspacePolicySchema>;

export const createProjectDeploymentTargetSchema = z.object({
  name: z.string().trim().min(1).max(120),
  environment: z.string().trim().min(1).max(80).default("production"),
  provider: z.string().trim().min(1).max(80).default("manual"),
  targetUrl: optionalUrlSchema,
  healthCheckUrl: optionalUrlSchema,
  deployNotes: optionalTrimmedText(),
  rollbackInstructions: optionalTrimmedText(),
  deployCommand: optionalTrimmedText(4000),
  rollbackCommand: optionalTrimmedText(4000),
  maintenanceUpdatesEnabled: z.boolean().default(false),
  maintenanceRecipients: deployMaintenanceRecipientsSchema,
  status: z.enum(PROJECT_DEPLOYMENT_TARGET_STATUSES).default("active"),
  metadata: z.record(z.unknown()).optional().nullable(),
});

export type CreateProjectDeploymentTarget = z.infer<typeof createProjectDeploymentTargetSchema>;

export const updateProjectDeploymentTargetSchema = createProjectDeploymentTargetSchema.partial();

export type UpdateProjectDeploymentTarget = z.infer<typeof updateProjectDeploymentTargetSchema>;

export const createProjectDeployApprovalSchema = z.object({
  issueId: z.string().uuid(),
  deploymentTargetId: z.string().uuid(),
  summary: z.string().trim().min(1).max(4000),
  changedFiles: deployEvidenceListSchema,
  testsRun: deployEvidenceListSchema,
  rollbackPlan: z.string().trim().min(1).max(4000),
  risk: optionalTrimmedText(2000),
  maintenanceMessage: optionalTrimmedText(2000),
  metadata: z.record(z.unknown()).optional().nullable(),
});

export type CreateProjectDeployApproval = z.infer<typeof createProjectDeployApprovalSchema>;

export const recordProjectDeployEventStatusSchema = z.object({
  status: z.enum(["deploying", "deployed", "failed", "rolled_back"]),
  note: optionalTrimmedText(2000),
  maintenanceMessage: optionalTrimmedText(2000),
  metadata: z.record(z.unknown()).optional().nullable(),
});

export type RecordProjectDeployEventStatus = z.infer<typeof recordProjectDeployEventStatusSchema>;

export const sendProjectDeployMaintenanceMessageSchema = z.object({
  message: optionalTrimmedText(4000),
});

export type SendProjectDeployMaintenanceMessage = z.infer<typeof sendProjectDeployMaintenanceMessageSchema>;

export const createProjectDeployCommandRecordSchema = z.object({
  commandType: z.enum(PROJECT_DEPLOY_COMMAND_TYPES),
  status: z.enum(PROJECT_DEPLOY_COMMAND_STATUSES),
  command: z.string().trim().min(1).max(4000),
  output: optionalTrimmedText(20000),
  exitCode: optionalTrimmedText(64),
  note: optionalTrimmedText(2000),
});

export type CreateProjectDeployCommandRecord = z.infer<typeof createProjectDeployCommandRecordSchema>;

export const createProjectInfraTargetSchema = z.object({
  deploymentTargetId: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(1).max(120),
  environment: z.string().trim().min(1).max(80).default("production"),
  provider: z.string().trim().min(1).max(80).default("manual"),
  providerAccountRef: optionalTrimmedText(200),
  region: optionalTrimmedText(120),
  role: z.string().trim().min(1).max(80).default("app"),
  host: optionalTrimmedText(500),
  failoverGroup: optionalTrimmedText(120),
  failoverRank: z.coerce.number().int().min(1).max(100).optional().nullable(),
  status: z.enum(PROJECT_INFRA_TARGET_STATUSES).default("active"),
  repairActionsRequireApproval: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional().nullable(),
});

export type CreateProjectInfraTarget = z.infer<typeof createProjectInfraTargetSchema>;

export const updateProjectInfraTargetSchema = createProjectInfraTargetSchema.partial();

export type UpdateProjectInfraTarget = z.infer<typeof updateProjectInfraTargetSchema>;

export const createProjectInfraHealthCheckSchema = z.object({
  infraTargetId: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(1).max(120),
  checkType: z.enum(PROJECT_INFRA_HEALTH_CHECK_TYPES).default("http"),
  url: optionalUrlSchema,
  expectedStatus: z.coerce.number().int().min(100).max(599).optional().nullable(),
  intervalSeconds: z.coerce.number().int().min(30).max(86_400).default(300),
  timeoutSeconds: z.coerce.number().int().min(1).max(120).default(10),
  enabled: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional().nullable(),
});

export type CreateProjectInfraHealthCheck = z.infer<typeof createProjectInfraHealthCheckSchema>;

export const updateProjectInfraHealthCheckSchema = createProjectInfraHealthCheckSchema.partial().extend({
  status: z.enum(PROJECT_INFRA_HEALTH_STATUSES).optional(),
  lastCheckedAt: z.coerce.date().optional().nullable(),
  lastLatencyMs: z.coerce.number().int().min(0).max(3_600_000).optional().nullable(),
  lastError: optionalTrimmedText(4000),
});

export type UpdateProjectInfraHealthCheck = z.infer<typeof updateProjectInfraHealthCheckSchema>;

export const recordProjectInfraHealthResultSchema = z.object({
  status: z.enum(PROJECT_INFRA_HEALTH_STATUSES),
  checkedAt: z.coerce.date().optional(),
  latencyMs: z.coerce.number().int().min(0).max(3_600_000).optional().nullable(),
  error: optionalTrimmedText(4000),
  createIncident: z.boolean().default(false),
  incidentSummary: optionalTrimmedText(300),
  incidentDetails: optionalTrimmedText(4000),
  severity: z.enum(PROJECT_INFRA_INCIDENT_SEVERITIES).default("high"),
});

export type RecordProjectInfraHealthResult = z.infer<typeof recordProjectInfraHealthResultSchema>;

export const createProjectInfraIncidentSchema = z.object({
  infraTargetId: z.string().uuid().optional().nullable(),
  healthCheckId: z.string().uuid().optional().nullable(),
  issueId: z.string().uuid().optional().nullable(),
  groupKey: optionalTrimmedText(200),
  sourceKind: z.string().trim().min(1).max(80).default("manual"),
  sourceId: optionalTrimmedText(200),
  status: z.enum(PROJECT_INFRA_INCIDENT_STATUSES).default("open"),
  severity: z.enum(PROJECT_INFRA_INCIDENT_SEVERITIES).default("high"),
  summary: z.string().trim().min(1).max(300),
  details: optionalTrimmedText(4000),
  recommendedAction: optionalTrimmedText(4000),
  occurrenceCount: z.number().int().min(1).optional(),
  lastOccurredAt: z.coerce.date().optional(),
  escalatedAt: z.coerce.date().optional().nullable(),
  escalationReason: optionalTrimmedText(4000),
  repairApprovalId: z.string().uuid().optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
});

export type CreateProjectInfraIncident = z.infer<typeof createProjectInfraIncidentSchema>;

export const updateProjectInfraIncidentSchema = createProjectInfraIncidentSchema.partial();

export type UpdateProjectInfraIncident = z.infer<typeof updateProjectInfraIncidentSchema>;

export const createProjectInfraActionProposalSchema = z.object({
  infraTargetId: z.string().uuid().optional().nullable(),
  actionType: z.enum(PROJECT_INFRA_ACTION_TYPES),
  summary: z.string().trim().min(1).max(300),
  rationale: z.string().trim().min(1).max(4000),
  proposedAction: z.string().trim().min(1).max(4000),
  rollbackPlan: optionalTrimmedText(4000),
  risk: optionalTrimmedText(2000),
  provider: optionalTrimmedText(80),
  region: optionalTrimmedText(120),
  evidenceRequired: optionalTrimmedText(2000),
  metadata: z.record(z.unknown()).optional().nullable(),
});

export type CreateProjectInfraActionProposal = z.infer<typeof createProjectInfraActionProposalSchema>;

export const createProjectInfraActionEvidenceSchema = z.object({
  status: z.enum(PROJECT_INFRA_ACTION_EVIDENCE_STATUSES),
  evidence: z.string().trim().min(1).max(4000),
  output: optionalTrimmedText(20000),
});

export type CreateProjectInfraActionEvidence = z.infer<typeof createProjectInfraActionEvidenceSchema>;

export const projectFilesPathSchema = z.object({
  path: z.string().optional().default(""),
  showIgnored: z.coerce.boolean().optional().default(false),
});

export type ProjectFilesPathInput = z.infer<typeof projectFilesPathSchema>;

export const projectFileReadSchema = z.object({
  path: z.string().min(1),
});

export type ProjectFileReadInput = z.infer<typeof projectFileReadSchema>;

export const projectFileSaveSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

export type ProjectFileSaveInput = z.infer<typeof projectFileSaveSchema>;

export const projectFileCreateSchema = z.object({
  path: z.string().min(1),
});

export type ProjectFileCreateInput = z.infer<typeof projectFileCreateSchema>;

export const projectFileRenameSchema = z.object({
  path: z.string().min(1),
  nextPath: z.string().min(1),
});

export type ProjectFileRenameInput = z.infer<typeof projectFileRenameSchema>;

export const projectFileDeleteSchema = z.object({
  path: z.string().min(1),
});

export type ProjectFileDeleteInput = z.infer<typeof projectFileDeleteSchema>;

export const projectFileBranchSwitchSchema = z.object({
  branch: z.string().min(1),
  mode: z.enum(["default", "autostash", "discard"]).optional().default("default"),
});

export type ProjectFileBranchSwitchInput = z.infer<typeof projectFileBranchSwitchSchema>;

export const projectFileBranchCreateSchema = z.object({
  name: z.string().min(1),
  startPoint: z.string().optional().nullable(),
});

export type ProjectFileBranchCreateInput = z.infer<typeof projectFileBranchCreateSchema>;

export const projectFileBranchPushSchema = z.object({
  name: z.string().min(1),
});

export type ProjectFileBranchPushInput = z.infer<typeof projectFileBranchPushSchema>;
