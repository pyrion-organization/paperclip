import type { ClientMetadata } from "./client.js";
import type {
  ClientStatus,
  PauseReason,
  ProjectDeployCommandStatus,
  ProjectDeployCommandType,
  ProjectDeployEventStatus,
  ProjectDeployMaintenanceMessageStatus,
  ProjectDeploymentTargetStatus,
  ProjectInfraHealthCheckType,
  ProjectInfraHealthResultSourceKind,
  ProjectInfraHealthStatus,
  ProjectInfraActionEvidenceStatus,
  ProjectInfraActionStatus,
  ProjectInfraActionType,
  ProjectInfraIncidentSeverity,
  ProjectInfraIncidentStatus,
  ProjectInfraProviderDescriptor,
  ProjectInfraTargetStatus,
  ProjectStatus,
} from "../constants.js";
import type {
  ProjectExecutionWorkspacePolicy,
  ProjectWorkspaceRuntimeConfig,
  WorkspaceRuntimeService,
} from "./workspace-runtime.js";
import type { AgentEnvConfig } from "./secrets.js";

export type ProjectWorkspaceSourceType = "local_path" | "git_repo" | "remote_managed" | "non_git_path";
export type ProjectWorkspaceVisibility = "default" | "advanced";

export interface ProjectGoalRef {
  id: string;
  title: string;
}

export interface ProjectWorkspace {
  id: string;
  companyId: string;
  projectId: string;
  name: string;
  sourceType: ProjectWorkspaceSourceType;
  cwd: string | null;
  repoUrl: string | null;
  repoRef: string | null;
  defaultRef: string | null;
  visibility: ProjectWorkspaceVisibility;
  setupCommand: string | null;
  cleanupCommand: string | null;
  remoteProvider: string | null;
  remoteWorkspaceRef: string | null;
  sharedWorkspaceKey: string | null;
  metadata: Record<string, unknown> | null;
  runtimeConfig: ProjectWorkspaceRuntimeConfig | null;
  isPrimary: boolean;
  runtimeServices?: WorkspaceRuntimeService[];
  createdAt: Date;
  updatedAt: Date;
}

export type ProjectCodebaseOrigin = "local_folder" | "managed_checkout";

export interface ProjectCodebase {
  workspaceId: string | null;
  repoUrl: string | null;
  repoRef: string | null;
  defaultRef: string | null;
  repoName: string | null;
  localFolder: string | null;
  managedFolder: string;
  effectiveLocalFolder: string;
  origin: ProjectCodebaseOrigin;
}

export interface ProjectClientRef {
  linkId: string;
  clientId: string;
  name: string;
  email: string | null;
  phone: string | null;
  contactName: string | null;
  notes: string | null;
  status: ClientStatus;
  metadata: ClientMetadata | null;
  relationshipDescription: string | null;
  relationshipTags: string[];
  projectAliases: string[];
  linkedAt: Date;
}

export type ProjectFilePreviewType = "text" | "markdown" | "json" | "image" | "binary";

export type ProjectFileType = "text" | "directory" | "image" | "binary";

export interface ProjectFilesAheadBehind {
  ahead: number | null;
  behind: number | null;
}

export interface ProjectFilesDirtyState {
  hasDirtyTrackedFiles: boolean;
  hasUntrackedFiles: boolean;
  dirtyEntryCount: number;
  untrackedEntryCount: number;
}

export interface ProjectFilesBranch {
  name: string;
  kind: "local" | "remote";
  current: boolean;
  tracking: string | null;
}

export interface ProjectFilesTreeEntry {
  name: string;
  path: string;
  kind: "file" | "dir";
  hiddenByDefault: boolean;
  fileType: ProjectFileType;
}

export interface ProjectFilesTreeResponse {
  path: string;
  entries: ProjectFilesTreeEntry[];
}

export interface ProjectFileDetail {
  path: string;
  name: string;
  fileType: ProjectFileType;
  previewType: ProjectFilePreviewType;
  size: number;
  language: string | null;
  textContent: string | null;
  base64Content: string | null;
  mimeType: string | null;
  updatedAt: Date;
}

export interface ProjectFilesSummary {
  available: boolean;
  companyId: string;
  projectId: string;
  workspaceId: string | null;
  workspaceName: string | null;
  rootPath: string | null;
  repoRoot: string | null;
  gitEnabled: boolean;
  hasRemote: boolean;
  currentBranch: string | null;
  branches: ProjectFilesBranch[];
  dirtyWorktree: ProjectFilesDirtyState | null;
  aheadBehind: ProjectFilesAheadBehind | null;
}

export interface ProjectFilesSyncResult {
  status: "success" | "conflict" | "auth_error" | "error";
  summary: ProjectFilesSummary;
  message: string | null;
}

export type ProjectFilesBranchSyncAction =
  | "pushed_to_remote"
  | "created_local_tracking"
  | "remote_deleted_local_remains"
  | "local_auto_deleted"
  | "already_in_sync"
  | "error";

export interface ProjectFilesBranchSyncDetail {
  branchName: string;
  action: ProjectFilesBranchSyncAction;
  errorMessage: string | null;
}

export interface ProjectFilesBranchSyncResult {
  status: "success" | "partial" | "auth_error" | "error";
  details: ProjectFilesBranchSyncDetail[];
  summary: ProjectFilesSummary;
  message: string | null;
}

export interface GitStatusEntry {
  path: string;
  oldPath: string | null;
  indexStatus: string;
  workingStatus: string;
  isStaged: boolean;
  isUnstaged: boolean;
  isUntracked: boolean;
}

export interface GitStatusResponse {
  entries: GitStatusEntry[];
}

export interface GitDiffResponse {
  diff: string;
  path: string;
}

export interface GitCommitResult {
  status: "success" | "error" | "nothing_to_commit";
  message: string | null;
  sha: string | null;
}

export interface GitPushResult {
  status: "success" | "error" | "auth_error";
  message: string | null;
}

export interface ProjectManagedByPlugin {
  id: string;
  pluginId: string;
  pluginKey: string;
  pluginDisplayName: string;
  resourceKind: "project";
  resourceKey: string;
  defaultsJson: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectDeploymentTarget {
  id: string;
  companyId: string;
  projectId: string;
  name: string;
  environment: string;
  provider: string;
  targetUrl: string | null;
  healthCheckUrl: string | null;
  deployNotes: string | null;
  rollbackInstructions: string | null;
  deployCommand: string | null;
  rollbackCommand: string | null;
  maintenanceUpdatesEnabled: boolean;
  maintenanceRecipients: string[];
  status: ProjectDeploymentTargetStatus;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectDeployCommandRecord {
  id: string;
  companyId: string;
  projectId: string;
  deployEventId: string;
  deploymentTargetId: string | null;
  approvalId: string | null;
  commandType: ProjectDeployCommandType;
  status: ProjectDeployCommandStatus;
  command: string;
  output: string | null;
  exitCode: string | null;
  note: string | null;
  recordedByAgentId: string | null;
  recordedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectDeployEvent {
  id: string;
  companyId: string;
  projectId: string;
  deploymentTargetId: string | null;
  issueId: string | null;
  approvalId: string | null;
  status: ProjectDeployEventStatus;
  summary: string;
  changedFiles: string[];
  testsRun: string[];
  rollbackPlan: string;
  maintenanceMessage: string | null;
  maintenanceMessageStatus: ProjectDeployMaintenanceMessageStatus | null;
  maintenanceMessageRecipients: string[];
  maintenanceMessageAttemptedAt: Date | null;
  maintenanceMessageSentAt: Date | null;
  maintenanceMessageError: string | null;
  metadata: Record<string, unknown> | null;
  createdByAgentId: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectInfraTarget {
  id: string;
  companyId: string;
  projectId: string;
  deploymentTargetId: string | null;
  name: string;
  environment: string;
  provider: string;
  providerDescriptor?: ProjectInfraProviderDescriptor | null;
  providerAccountRef: string | null;
  region: string | null;
  role: string;
  host: string | null;
  failoverGroup: string | null;
  failoverRank: number | null;
  status: ProjectInfraTargetStatus;
  repairActionsRequireApproval: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectInfraHealthCheck {
  id: string;
  companyId: string;
  projectId: string;
  infraTargetId: string | null;
  name: string;
  checkType: ProjectInfraHealthCheckType;
  url: string | null;
  expectedStatus: number | null;
  intervalSeconds: number;
  timeoutSeconds: number;
  status: ProjectInfraHealthStatus;
  lastCheckedAt: Date | null;
  lastLatencyMs: number | null;
  lastError: string | null;
  lastSourceKind: ProjectInfraHealthResultSourceKind | null;
  lastSourceId: string | null;
  lastSourceDetail: string | null;
  lastSourceMetadata: Record<string, unknown> | null;
  enabled: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectInfraIncident {
  id: string;
  companyId: string;
  projectId: string;
  infraTargetId: string | null;
  healthCheckId: string | null;
  issueId: string | null;
  groupKey: string | null;
  sourceKind: string;
  sourceId: string | null;
  status: ProjectInfraIncidentStatus;
  severity: ProjectInfraIncidentSeverity;
  summary: string;
  details: string | null;
  recommendedAction: string | null;
  occurrenceCount: number;
  lastOccurredAt: Date;
  escalatedAt: Date | null;
  escalationReason: string | null;
  repairApprovalId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectInfraActionProposal {
  id: string;
  companyId: string;
  projectId: string;
  incidentId: string;
  infraTargetId: string | null;
  approvalId: string | null;
  actionType: ProjectInfraActionType;
  status: ProjectInfraActionStatus;
  summary: string;
  rationale: string;
  proposedAction: string;
  rollbackPlan: string | null;
  risk: string | null;
  provider: string | null;
  region: string | null;
  evidenceRequired: string | null;
  metadata: Record<string, unknown> | null;
  createdByAgentId: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectInfraActionEvidence {
  id: string;
  companyId: string;
  projectId: string;
  proposalId: string;
  approvalId: string | null;
  status: ProjectInfraActionEvidenceStatus;
  evidence: string;
  output: string | null;
  recordedByAgentId: string | null;
  recordedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Project {
  id: string;
  companyId: string;
  urlKey: string;
  /** @deprecated Use goalIds / goals instead */
  goalId: string | null;
  goalIds: string[];
  goals: ProjectGoalRef[];
  name: string;
  description: string | null;
  status: ProjectStatus;
  leadAgentId: string | null;
  targetDate: string | null;
  color: string | null;
  env: AgentEnvConfig | null;
  pauseReason: PauseReason | null;
  pausedAt: Date | null;
  executionWorkspacePolicy: ProjectExecutionWorkspacePolicy | null;
  codebase: ProjectCodebase;
  clients: ProjectClientRef[];
  workspaces: ProjectWorkspace[];
  primaryWorkspace: ProjectWorkspace | null;
  managedByPlugin?: ProjectManagedByPlugin | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
