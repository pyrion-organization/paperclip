import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockProjectService = vi.hoisted(() => ({
  getById: vi.fn(),
  resolveByReference: vi.fn(),
  getDeploymentTarget: vi.fn(),
  getDeployEvent: vi.fn(),
  createDeployEvent: vi.fn(),
  updateDeployEventStatus: vi.fn(),
  recordDeployMaintenanceMessageDelivery: vi.fn(),
  listDeployCommandRecords: vi.fn(),
  createDeployCommandRecord: vi.fn(),
  listWorkspaces: vi.fn(),
  listInfraTargets: vi.fn(),
  getInfraTarget: vi.fn(),
  createInfraTarget: vi.fn(),
  listInfraHealthChecks: vi.fn(),
  getInfraHealthCheck: vi.fn(),
  createInfraHealthCheck: vi.fn(),
  removeInfraHealthCheck: vi.fn(),
  rotateInfraHealthExternalMonitorToken: vi.fn(),
  revokeInfraHealthExternalMonitorToken: vi.fn(),
  recordExternalInfraHealthResult: vi.fn(),
  recordInfraHealthResult: vi.fn(),
  listInfraIncidents: vi.fn(),
  getInfraIncident: vi.fn(),
  createInfraIncident: vi.fn(),
  updateInfraIncident: vi.fn(),
  listInfraActionProposals: vi.fn(),
  getInfraActionProposal: vi.fn(),
  createInfraActionProposal: vi.fn(),
  updateInfraActionProposal: vi.fn(),
  listInfraActionEvidence: vi.fn(),
  createInfraActionEvidence: vi.fn(),
  listDeploymentTargets: vi.fn(),
  listDeployEvents: vi.fn(),
}));
const mockApprovalService = vi.hoisted(() => ({
  create: vi.fn(),
  getById: vi.fn(),
}));
const mockIssueApprovalService = vi.hoisted(() => ({
  linkManyForApproval: vi.fn(),
}));
const mockIssueService = vi.hoisted(() => ({
  getById: vi.fn(),
  create: vi.fn(),
}));
const mockWorkspaceOperationService = vi.hoisted(() => ({
  createRecorder: vi.fn(() => ({ recordOperation: vi.fn() })),
}));
const mockLogActivity = vi.hoisted(() => vi.fn());
const mockSendDeployMaintenanceEmail = vi.hoisted(() => vi.fn());
const mockRunWorkspaceJobForControl = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", () => ({
  environmentService: () => ({ getById: vi.fn() }),
  initWorkspaceGit: vi.fn(),
  logActivity: mockLogActivity,
  projectFilesService: () => ({}),
  projectService: () => mockProjectService,
  secretService: () => ({}),
  workspaceOperationService: () => mockWorkspaceOperationService,
}));
vi.mock("../services/approvals.js", () => ({
  approvalService: () => mockApprovalService,
}));
vi.mock("../services/issue-approvals.js", () => ({
  issueApprovalService: () => mockIssueApprovalService,
}));
vi.mock("../services/issues.js", () => ({
  issueService: () => mockIssueService,
}));
vi.mock("../services/email.js", () => ({
  sendProjectDeployMaintenanceEmailWithResult: mockSendDeployMaintenanceEmail,
}));
vi.mock("../services/environments.js", () => ({
  environmentService: () => ({ getById: vi.fn() }),
}));
vi.mock("../services/secrets.js", () => ({
  secretService: () => ({}),
}));
vi.mock("../services/workspace-runtime.js", () => ({
  runWorkspaceJobForControl: mockRunWorkspaceJobForControl,
  startRuntimeServicesForWorkspaceControl: vi.fn(),
  stopRuntimeServicesForProjectWorkspace: vi.fn(),
}));

function buildProject() {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    companyId: "company-1",
    urlKey: "project",
    name: "Project",
  };
}

function buildIssue(overrides: Record<string, unknown> = {}) {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    companyId: "company-1",
    projectId: "11111111-1111-4111-8111-111111111111",
    identifier: "PAP-123",
    title: "Fix checkout bug",
    status: "in_review",
    priority: "high",
    originKind: "inbound_email",
    originId: "message-1",
    ...overrides,
  };
}

function buildTarget(overrides: Record<string, unknown> = {}) {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    companyId: "company-1",
    projectId: "11111111-1111-4111-8111-111111111111",
    name: "Production",
    environment: "production",
    provider: "manual",
    targetUrl: "https://example.com",
    healthCheckUrl: "https://example.com/health",
    deployNotes: null,
    rollbackInstructions: "Rollback with previous release.",
    deployCommand: "pnpm deploy:prod",
    rollbackCommand: "pnpm rollback:prod",
    commandExecutionEnabled: true,
    status: "active",
    maintenanceUpdatesEnabled: true,
    maintenanceRecipients: ["ops@example.com"],
    ...overrides,
  };
}

function buildDeployEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    companyId: "company-1",
    projectId: "11111111-1111-4111-8111-111111111111",
    deploymentTargetId: "33333333-3333-4333-8333-333333333333",
    issueId: "22222222-2222-4222-8222-222222222222",
    approvalId: "44444444-4444-4444-8444-444444444444",
    status: "approved",
    summary: "Deploy checkout fix",
    changedFiles: ["server/src/checkout.ts"],
    testsRun: ["pnpm test checkout"],
    rollbackPlan: "Revert commit abc123.",
    maintenanceMessage: null,
    maintenanceMessageStatus: null,
    maintenanceMessageRecipients: [],
    maintenanceMessageAttemptedAt: null,
    maintenanceMessageSentAt: null,
    maintenanceMessageError: null,
    ...overrides,
  };
}

function buildDeployCommandRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    companyId: "company-1",
    projectId: "11111111-1111-4111-8111-111111111111",
    deployEventId: "55555555-5555-4555-8555-555555555555",
    deploymentTargetId: "33333333-3333-4333-8333-333333333333",
    approvalId: "44444444-4444-4444-8444-444444444444",
    commandType: "deploy",
    status: "succeeded",
    command: "pnpm deploy:prod",
    output: null,
    exitCode: null,
    note: "Manual deploy completed.",
    recordedByAgentId: "agent-1",
    recordedByUserId: null,
    createdAt: new Date("2026-05-23T00:00:00.000Z"),
    updatedAt: new Date("2026-05-23T00:00:00.000Z"),
    ...overrides,
  };
}

function buildWorkspace(overrides: Record<string, unknown> = {}) {
  return {
    id: "77777777-7777-4777-8777-777777777777",
    companyId: "company-1",
    projectId: "11111111-1111-4111-8111-111111111111",
    name: "Primary",
    sourceType: "local_path",
    cwd: "/tmp/project-workspace",
    repoUrl: null,
    repoRef: null,
    defaultRef: "main",
    visibility: "default",
    setupCommand: null,
    cleanupCommand: null,
    remoteProvider: null,
    remoteWorkspaceRef: null,
    sharedWorkspaceKey: null,
    metadata: null,
    runtimeConfig: null,
    isPrimary: true,
    runtimeServices: [],
    createdAt: new Date("2026-05-23T00:00:00.000Z"),
    updatedAt: new Date("2026-05-23T00:00:00.000Z"),
    ...overrides,
  };
}

function buildInfraTarget(overrides: Record<string, unknown> = {}) {
  return {
    id: "77777777-7777-4777-8777-777777777777",
    companyId: "company-1",
    projectId: "11111111-1111-4111-8111-111111111111",
    deploymentTargetId: "33333333-3333-4333-8333-333333333333",
    name: "Primary VPS",
    environment: "production",
    provider: "hetzner",
    providerAccountRef: "acct-prod",
    region: "fsn1",
    role: "app",
    host: "app-1",
    failoverGroup: "prod-app",
    failoverRank: 1,
    status: "active",
    repairActionsRequireApproval: true,
    metadata: null,
    ...overrides,
  };
}

function buildInfraHealthCheck(overrides: Record<string, unknown> = {}) {
  return {
    id: "88888888-8888-4888-8888-888888888888",
    companyId: "company-1",
    projectId: "11111111-1111-4111-8111-111111111111",
    infraTargetId: "77777777-7777-4777-8777-777777777777",
    name: "Production health",
    checkType: "http",
    url: "https://example.com/health",
    expectedStatus: 200,
    intervalSeconds: 300,
    timeoutSeconds: 10,
    status: "unknown",
    lastCheckedAt: null,
    lastLatencyMs: null,
    lastError: null,
    lastSourceKind: null,
    lastSourceId: null,
    lastSourceDetail: null,
    lastSourceMetadata: null,
    externalMonitorEnabled: false,
    externalMonitorTokenHint: null,
    enabled: true,
    metadata: null,
    ...overrides,
  };
}

function buildInfraIncident(overrides: Record<string, unknown> = {}) {
  return {
    id: "99999999-9999-4999-8999-999999999999",
    companyId: "company-1",
    projectId: "11111111-1111-4111-8111-111111111111",
    infraTargetId: "77777777-7777-4777-8777-777777777777",
    healthCheckId: "88888888-8888-4888-8888-888888888888",
    issueId: "22222222-2222-4222-8222-222222222222",
    sourceKind: "health_check",
    sourceId: "88888888-8888-4888-8888-888888888888",
    status: "open",
    severity: "high",
    summary: "Production health reported unhealthy",
    details: "Timeout",
    recommendedAction: "Investigate health check failure.",
    repairApprovalId: null,
    metadata: null,
    createdAt: new Date("2026-05-23T00:00:00.000Z"),
    updatedAt: new Date("2026-05-23T00:00:00.000Z"),
    ...overrides,
  };
}

function buildInfraActionProposal(overrides: Record<string, unknown> = {}) {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    companyId: "company-1",
    projectId: "11111111-1111-4111-8111-111111111111",
    incidentId: "99999999-9999-4999-8999-999999999999",
    infraTargetId: "77777777-7777-4777-8777-777777777777",
    approvalId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    actionType: "repair",
    status: "approval_requested",
    summary: "Restart primary service",
    rationale: "Health check is failing.",
    proposedAction: "Restart the service manually.",
    rollbackPlan: "Stop if errors increase.",
    risk: "Service restart may interrupt active requests.",
    provider: "hetzner",
    region: "fsn1",
    evidenceRequired: "Record service status after restart.",
    metadata: null,
    createdByAgentId: "agent-1",
    createdByUserId: null,
    createdAt: new Date("2026-05-23T00:00:00.000Z"),
    updatedAt: new Date("2026-05-23T00:00:00.000Z"),
    ...overrides,
  };
}

function buildInfraActionEvidence(overrides: Record<string, unknown> = {}) {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    companyId: "company-1",
    projectId: "11111111-1111-4111-8111-111111111111",
    proposalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    approvalId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    status: "succeeded",
    evidence: "Service restarted and health check recovered.",
    output: null,
    recordedByAgentId: "agent-1",
    recordedByUserId: null,
    createdAt: new Date("2026-05-23T00:00:00.000Z"),
    updatedAt: new Date("2026-05-23T00:00:00.000Z"),
    ...overrides,
  };
}

function buildApproval(overrides: Record<string, unknown> = {}) {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    companyId: "company-1",
    type: "deploy_change",
    requestedByAgentId: "agent-1",
    requestedByUserId: null,
    status: "approved",
    payload: {},
    ...overrides,
  };
}

async function createApp(actorType: "agent" | "board" = "agent") {
  const [{ projectRoutes }, { errorHandler }] = await Promise.all([
    import("../routes/projects.js"),
    import("../middleware/index.js"),
  ]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actorType === "board"
      ? {
          type: "board",
          userId: "user-1",
          companyIds: ["company-1"],
          isInstanceAdmin: true,
          source: "local_implicit",
        }
      : {
          type: "agent",
          agentId: "agent-1",
          companyId: "company-1",
          source: "api_key",
        };
    next();
  });
  app.use("/api", projectRoutes({} as any));
  app.use(errorHandler);
  return app;
}

describe("project deploy workflow routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectService.resolveByReference.mockResolvedValue({ ambiguous: false, project: null });
    mockProjectService.getById.mockResolvedValue(buildProject());
    mockProjectService.getDeploymentTarget.mockResolvedValue(buildTarget());
    mockProjectService.getDeployEvent.mockResolvedValue(buildDeployEvent());
    mockProjectService.updateDeployEventStatus.mockImplementation(async (_projectId, _eventId, data) =>
      buildDeployEvent({ status: data.status }),
    );
    mockProjectService.listDeployCommandRecords.mockResolvedValue([]);
    mockProjectService.createDeployCommandRecord.mockImplementation(async (_projectId, data) =>
      buildDeployCommandRecord(data),
    );
    mockProjectService.listWorkspaces.mockResolvedValue([buildWorkspace()]);
    mockRunWorkspaceJobForControl.mockResolvedValue({
      id: "88888888-8888-4888-8888-888888888888",
      stdoutExcerpt: "deploy ok",
      stderrExcerpt: null,
      exitCode: 0,
    });
    mockProjectService.listInfraTargets.mockResolvedValue([buildInfraTarget()]);
    mockProjectService.getInfraTarget.mockResolvedValue(buildInfraTarget());
    mockProjectService.createInfraTarget.mockImplementation(async (_projectId, data) =>
      buildInfraTarget(data),
    );
    mockProjectService.listInfraHealthChecks.mockResolvedValue([buildInfraHealthCheck()]);
    mockProjectService.getInfraHealthCheck.mockResolvedValue(buildInfraHealthCheck());
    mockProjectService.createInfraHealthCheck.mockImplementation(async (_projectId, data) =>
      buildInfraHealthCheck(data),
    );
    mockProjectService.removeInfraHealthCheck.mockResolvedValue(buildInfraHealthCheck());
    mockProjectService.rotateInfraHealthExternalMonitorToken.mockResolvedValue({
      healthCheck: buildInfraHealthCheck({ externalMonitorEnabled: true, externalMonitorTokenHint: "abcd1234" }),
      token: "pcmon_test_abcd1234",
    });
    mockProjectService.revokeInfraHealthExternalMonitorToken.mockResolvedValue(
      buildInfraHealthCheck({ externalMonitorEnabled: false, externalMonitorTokenHint: null }),
    );
    mockProjectService.recordExternalInfraHealthResult.mockImplementation(async (_healthCheckId, _token, data) =>
      buildInfraHealthCheck({
        status: data.status,
        lastCheckedAt: data.checkedAt ?? new Date("2026-05-23T00:00:00.000Z"),
        lastLatencyMs: data.latencyMs ?? null,
        lastError: data.error ?? null,
        lastSourceKind: "external_monitor",
        lastSourceId: data.sourceId ?? null,
        lastSourceDetail: data.sourceDetail ?? null,
        lastSourceMetadata: data.sourceMetadata ?? null,
      }),
    );
    mockProjectService.recordInfraHealthResult.mockImplementation(async (_projectId, _healthCheckId, data) =>
      buildInfraHealthCheck({
        status: data.status,
        lastCheckedAt: data.checkedAt ?? new Date("2026-05-23T00:00:00.000Z"),
        lastLatencyMs: data.latencyMs ?? null,
        lastError: data.error ?? null,
      }),
    );
    mockProjectService.listInfraIncidents.mockResolvedValue([]);
    mockProjectService.getInfraIncident.mockResolvedValue(buildInfraIncident());
    mockProjectService.createInfraIncident.mockImplementation(async (_projectId, data) =>
      buildInfraIncident(data),
    );
    mockProjectService.updateInfraIncident.mockImplementation(async (_projectId, _incidentId, data) =>
      buildInfraIncident(data),
    );
    mockProjectService.listInfraActionProposals.mockResolvedValue([]);
    mockProjectService.getInfraActionProposal.mockResolvedValue(buildInfraActionProposal({ status: "approved" }));
    mockProjectService.createInfraActionProposal.mockImplementation(async (_projectId, data) =>
      buildInfraActionProposal(data),
    );
    mockProjectService.updateInfraActionProposal.mockImplementation(async (_projectId, _proposalId, data) =>
      buildInfraActionProposal(data),
    );
    mockProjectService.listInfraActionEvidence.mockResolvedValue([]);
    mockProjectService.createInfraActionEvidence.mockImplementation(async (_projectId, data) =>
      buildInfraActionEvidence(data),
    );
    mockProjectService.recordDeployMaintenanceMessageDelivery.mockImplementation(async (_projectId, _eventId, data) =>
      buildDeployEvent({
        maintenanceMessageStatus: data.status,
        maintenanceMessageRecipients: data.recipients,
      }),
    );
    mockIssueService.getById.mockResolvedValue(buildIssue());
    mockIssueService.create.mockResolvedValue(buildIssue({
      id: "22222222-2222-4222-8222-222222222222",
      originKind: "infra_health_check",
      originId: "88888888-8888-4888-8888-888888888888",
    }));
    mockSendDeployMaintenanceEmail.mockResolvedValue({ status: "sent" });
    mockApprovalService.create.mockResolvedValue({
      id: "44444444-4444-4444-8444-444444444444",
      companyId: "company-1",
      type: "deploy_change",
      status: "pending",
      payload: {},
    });
    mockApprovalService.getById.mockResolvedValue(buildApproval());
    mockProjectService.createDeployEvent.mockResolvedValue({
      id: "55555555-5555-4555-8555-555555555555",
      status: "approval_requested",
    });
  });

  it("creates a deploy approval linked to the project issue and records a deploy event", async () => {
    const app = await createApp();
    const res = await request(app)
      .post("/api/projects/11111111-1111-4111-8111-111111111111/deploy-approvals")
      .send({
        issueId: "22222222-2222-4222-8222-222222222222",
        deploymentTargetId: "33333333-3333-4333-8333-333333333333",
        summary: "Deploy checkout fix",
        changedFiles: ["server/src/checkout.ts"],
        testsRun: ["pnpm test checkout"],
        rollbackPlan: "Revert commit abc123 and restart service.",
        maintenanceMessage: "Checkout maintenance is planned.",
      });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(mockApprovalService.create).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({
        type: "deploy_change",
        requestedByAgentId: "agent-1",
        payload: expect.objectContaining({
          summary: "Deploy checkout fix",
          changedFiles: ["server/src/checkout.ts"],
          rollbackPlan: "Revert commit abc123 and restart service.",
          deploymentTarget: expect.objectContaining({ name: "Production" }),
          issue: expect.objectContaining({ identifier: "PAP-123" }),
        }),
      }),
    );
    expect(mockIssueApprovalService.linkManyForApproval).toHaveBeenCalledWith(
      "44444444-4444-4444-8444-444444444444",
      ["22222222-2222-4222-8222-222222222222"],
      expect.objectContaining({ agentId: "agent-1" }),
    );
    expect(mockProjectService.createDeployEvent).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      expect.objectContaining({
        status: "approval_requested",
        approvalId: "44444444-4444-4444-8444-444444444444",
        changedFiles: ["server/src/checkout.ts"],
        testsRun: ["pnpm test checkout"],
      }),
    );
  });

  it("rejects deploy approval requests for disabled targets", async () => {
    mockProjectService.getDeploymentTarget.mockResolvedValue(buildTarget({ status: "disabled" }));

    const app = await createApp();
    const res = await request(app)
      .post("/api/projects/11111111-1111-4111-8111-111111111111/deploy-approvals")
      .send({
        issueId: "22222222-2222-4222-8222-222222222222",
        deploymentTargetId: "33333333-3333-4333-8333-333333333333",
        summary: "Deploy checkout fix",
        changedFiles: [],
        testsRun: [],
        rollbackPlan: "Revert commit abc123.",
      });

    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(mockApprovalService.create).not.toHaveBeenCalled();
    expect(mockProjectService.createDeployEvent).not.toHaveBeenCalled();
  });

  it("lets the requesting agent mark an approved deploy event as deploying", async () => {
    const app = await createApp();
    const res = await request(app)
      .patch("/api/projects/11111111-1111-4111-8111-111111111111/deploy-events/55555555-5555-4555-8555-555555555555/status")
      .send({
        status: "deploying",
        note: "Starting manual deploy.",
      });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(mockProjectService.updateDeployEventStatus).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "55555555-5555-4555-8555-555555555555",
      expect.objectContaining({
        status: "deploying",
        note: "Starting manual deploy.",
        actor: expect.objectContaining({ actorType: "agent", actorId: "agent-1" }),
      }),
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "project.deploy_event_status_updated",
        details: expect.objectContaining({
          fromStatus: "approved",
          toStatus: "deploying",
        }),
      }),
    );
  });

  it("blocks deploy execution before approval is accepted", async () => {
    mockApprovalService.getById.mockResolvedValue(buildApproval({ status: "pending" }));

    const app = await createApp();
    const res = await request(app)
      .patch("/api/projects/11111111-1111-4111-8111-111111111111/deploy-events/55555555-5555-4555-8555-555555555555/status")
      .send({ status: "deploying" });

    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(mockProjectService.updateDeployEventStatus).not.toHaveBeenCalled();
  });

  it("rejects invalid deploy status transitions", async () => {
    mockProjectService.getDeployEvent.mockResolvedValue(buildDeployEvent({ status: "approval_requested" }));

    const app = await createApp();
    const res = await request(app)
      .patch("/api/projects/11111111-1111-4111-8111-111111111111/deploy-events/55555555-5555-4555-8555-555555555555/status")
      .send({ status: "deployed" });

    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(mockProjectService.updateDeployEventStatus).not.toHaveBeenCalled();
  });

  it("records approved deploy command evidence when the command matches the target descriptor", async () => {
    const app = await createApp();
    const res = await request(app)
      .post("/api/projects/11111111-1111-4111-8111-111111111111/deploy-events/55555555-5555-4555-8555-555555555555/command-records")
      .send({
        commandType: "deploy",
        status: "succeeded",
        command: "pnpm deploy:prod",
        note: "Manual deploy completed.",
      });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(mockProjectService.createDeployCommandRecord).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      expect.objectContaining({
        deployEventId: "55555555-5555-4555-8555-555555555555",
        deploymentTargetId: "33333333-3333-4333-8333-333333333333",
        approvalId: "44444444-4444-4444-8444-444444444444",
        commandType: "deploy",
        status: "succeeded",
        command: "pnpm deploy:prod",
        note: "Manual deploy completed.",
        recordedByAgentId: "agent-1",
      }),
    );
    expect(mockProjectService.updateDeployEventStatus).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "55555555-5555-4555-8555-555555555555",
      expect.objectContaining({
        status: "deployed",
        note: "Deploy command evidence recorded: deploy succeeded",
        metadata: expect.objectContaining({
          commandRecordId: "66666666-6666-4666-8666-666666666666",
          commandType: "deploy",
          commandStatus: "succeeded",
        }),
      }),
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "project.deploy_command_recorded",
        details: expect.objectContaining({
          commandRecordId: "66666666-6666-4666-8666-666666666666",
          commandType: "deploy",
          status: "succeeded",
          deployEventStatus: "deployed",
        }),
      }),
    );
  });

  it("moves a deploy event to deploying when running command evidence is recorded", async () => {
    const app = await createApp();
    const res = await request(app)
      .post("/api/projects/11111111-1111-4111-8111-111111111111/deploy-events/55555555-5555-4555-8555-555555555555/command-records")
      .send({
        commandType: "deploy",
        status: "running",
        command: "pnpm deploy:prod",
      });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(mockProjectService.updateDeployEventStatus).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "55555555-5555-4555-8555-555555555555",
      expect.objectContaining({ status: "deploying" }),
    );
  });

  it("moves a deploy event to rolled back when rollback success evidence is recorded", async () => {
    mockProjectService.getDeployEvent.mockResolvedValue(buildDeployEvent({ status: "deployed" }));

    const app = await createApp();
    const res = await request(app)
      .post("/api/projects/11111111-1111-4111-8111-111111111111/deploy-events/55555555-5555-4555-8555-555555555555/command-records")
      .send({
        commandType: "rollback",
        status: "succeeded",
        command: "pnpm rollback:prod",
        note: "Rollback completed and health checks recovered.",
      });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(mockProjectService.updateDeployEventStatus).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "55555555-5555-4555-8555-555555555555",
      expect.objectContaining({ status: "rolled_back" }),
    );
  });

  it("requires evidence for terminal deploy command records", async () => {
    const app = await createApp();
    const res = await request(app)
      .post("/api/projects/11111111-1111-4111-8111-111111111111/deploy-events/55555555-5555-4555-8555-555555555555/command-records")
      .send({
        commandType: "deploy",
        status: "succeeded",
        command: "pnpm deploy:prod",
      });

    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(res.body.error).toBe("Terminal deploy command evidence requires output, note, or exit code");
    expect(mockProjectService.createDeployCommandRecord).not.toHaveBeenCalled();
    expect(mockProjectService.updateDeployEventStatus).not.toHaveBeenCalled();
  });

  it("executes an approved deploy command in the local project workspace", async () => {
    const app = await createApp();
    const res = await request(app)
      .post("/api/projects/11111111-1111-4111-8111-111111111111/deploy-events/55555555-5555-4555-8555-555555555555/command-executions")
      .send({ commandType: "deploy" });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(mockRunWorkspaceJobForControl).toHaveBeenCalledWith(expect.objectContaining({
      command: expect.objectContaining({
        command: "pnpm deploy:prod",
        name: "deploy command for Production",
      }),
      workspace: expect.objectContaining({
        cwd: "/tmp/project-workspace",
        workspaceId: "77777777-7777-4777-8777-777777777777",
      }),
      metadata: expect.objectContaining({
        deployEventId: "55555555-5555-4555-8555-555555555555",
        deploymentTargetId: "33333333-3333-4333-8333-333333333333",
        commandType: "deploy",
      }),
    }));
    expect(mockProjectService.updateDeployEventStatus).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "55555555-5555-4555-8555-555555555555",
      expect.objectContaining({ status: "deploying" }),
    );
    expect(mockProjectService.createDeployCommandRecord).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      expect.objectContaining({
        commandType: "deploy",
        status: "succeeded",
        command: "pnpm deploy:prod",
        output: "stdout:\ndeploy ok",
        exitCode: "0",
        note: "Executed by Paperclip workspace operation 88888888-8888-4888-8888-888888888888",
      }),
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "project.deploy_command_executed",
        details: expect.objectContaining({
          commandType: "deploy",
          status: "succeeded",
          deployEventStatus: "deployed",
        }),
      }),
    );
  });

  it("blocks deploy command execution unless the deployment target explicitly opts in", async () => {
    mockProjectService.getDeploymentTarget.mockResolvedValue(buildTarget({ commandExecutionEnabled: false }));

    const app = await createApp();
    const res = await request(app)
      .post("/api/projects/11111111-1111-4111-8111-111111111111/deploy-events/55555555-5555-4555-8555-555555555555/command-executions")
      .send({ commandType: "deploy" });

    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(mockRunWorkspaceJobForControl).not.toHaveBeenCalled();
    expect(mockProjectService.createDeployCommandRecord).not.toHaveBeenCalled();
  });

  it("records failed deploy command execution evidence when the workspace command fails", async () => {
    mockRunWorkspaceJobForControl.mockRejectedValue(new Error("deploy failed"));

    const app = await createApp();
    const res = await request(app)
      .post("/api/projects/11111111-1111-4111-8111-111111111111/deploy-events/55555555-5555-4555-8555-555555555555/command-executions")
      .send({ commandType: "deploy" });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(mockProjectService.createDeployCommandRecord).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      expect.objectContaining({
        commandType: "deploy",
        status: "failed",
        command: "pnpm deploy:prod",
        note: "Paperclip command execution failed: deploy failed",
      }),
    );
    expect(mockProjectService.updateDeployEventStatus).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "55555555-5555-4555-8555-555555555555",
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("blocks command evidence before the deploy approval is accepted", async () => {
    mockApprovalService.getById.mockResolvedValue(buildApproval({ status: "pending" }));

    const app = await createApp();
    const res = await request(app)
      .post("/api/projects/11111111-1111-4111-8111-111111111111/deploy-events/55555555-5555-4555-8555-555555555555/command-records")
      .send({
        commandType: "deploy",
        status: "succeeded",
        command: "pnpm deploy:prod",
      });

    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(mockProjectService.createDeployCommandRecord).not.toHaveBeenCalled();
  });

  it("rejects command evidence that does not match the deployment target descriptor", async () => {
    const app = await createApp();
    const res = await request(app)
      .post("/api/projects/11111111-1111-4111-8111-111111111111/deploy-events/55555555-5555-4555-8555-555555555555/command-records")
      .send({
        commandType: "deploy",
        status: "succeeded",
        command: "pnpm deploy:other",
      });

    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(mockProjectService.createDeployCommandRecord).not.toHaveBeenCalled();
  });

  it("rejects rollback command evidence before the deploy event reaches a rollback-eligible status", async () => {
    const app = await createApp();
    const res = await request(app)
      .post("/api/projects/11111111-1111-4111-8111-111111111111/deploy-events/55555555-5555-4555-8555-555555555555/command-records")
      .send({
        commandType: "rollback",
        status: "succeeded",
        command: "pnpm rollback:prod",
      });

    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(mockProjectService.createDeployCommandRecord).not.toHaveBeenCalled();
  });

  it("creates project infrastructure targets without enabling provider repair", async () => {
    const app = await createApp("board");
    const res = await request(app)
      .post("/api/projects/11111111-1111-4111-8111-111111111111/infra-targets")
      .send({
        deploymentTargetId: "33333333-3333-4333-8333-333333333333",
        name: "Primary VPS",
        provider: "hetzner",
        providerAccountRef: "acct-prod",
        region: "fsn1",
        failoverGroup: "prod-app",
        failoverRank: 1,
      });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(mockProjectService.createInfraTarget).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      expect.objectContaining({
        name: "Primary VPS",
        provider: "hetzner",
        repairActionsRequireApproval: true,
      }),
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "project.infra_target_created" }),
    );
  }, 20_000);

  it("rejects provider credentials in project infrastructure target metadata", async () => {
    const app = await createApp("board");
    const res = await request(app)
      .post("/api/projects/11111111-1111-4111-8111-111111111111/infra-targets")
      .send({
        name: "Primary VPS",
        provider: "hetzner",
        metadata: {
          apiToken: "do-not-store-here",
        },
      });

    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(mockProjectService.createInfraTarget).not.toHaveBeenCalled();
  }, 20_000);

  it("records an unhealthy health result and creates an infra incident issue", async () => {
    const app = await createApp();
    const res = await request(app)
      .post("/api/projects/11111111-1111-4111-8111-111111111111/infra-health-checks/88888888-8888-4888-8888-888888888888/results")
      .send({
        status: "unhealthy",
        error: "Timeout",
        createIncident: true,
        incidentSummary: "Production health reported unhealthy",
        severity: "urgent",
      });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(mockProjectService.recordInfraHealthResult).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "88888888-8888-4888-8888-888888888888",
      expect.objectContaining({
        status: "unhealthy",
        error: "Timeout",
      }),
    );
    expect(mockIssueService.create).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({
        title: "[Infra] Production health reported unhealthy",
        priority: "critical",
        projectId: "11111111-1111-4111-8111-111111111111",
        originKind: "infra_health_check",
        originId: "88888888-8888-4888-8888-888888888888",
      }),
    );
    expect(mockProjectService.createInfraIncident).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      expect.objectContaining({
        healthCheckId: "88888888-8888-4888-8888-888888888888",
        issueId: "22222222-2222-4222-8222-222222222222",
        sourceKind: "health_check",
        severity: "urgent",
      }),
    );
  });

  it("does not create infra incidents from healthy health results", async () => {
    const app = await createApp();
    const res = await request(app)
      .post("/api/projects/11111111-1111-4111-8111-111111111111/infra-health-checks/88888888-8888-4888-8888-888888888888/results")
      .send({
        status: "healthy",
        createIncident: true,
      });

    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(mockIssueService.create).not.toHaveBeenCalled();
    expect(mockProjectService.createInfraIncident).not.toHaveBeenCalled();
  });

  it("validates relation IDs before updating infrastructure incidents", async () => {
    const app = await createApp("board");
    const repairApproval = buildApproval({
      type: "infra_repair",
      payload: { project: { id: "11111111-1111-4111-8111-111111111111" } },
    });
    mockApprovalService.getById.mockResolvedValueOnce(repairApproval);

    const body = {
      infraTargetId: "77777777-7777-4777-8777-777777777777",
      healthCheckId: "88888888-8888-4888-8888-888888888888",
      issueId: "22222222-2222-4222-8222-222222222222",
      repairApprovalId: "44444444-4444-4444-8444-444444444444",
    };
    const res = await request(app)
      .patch("/api/projects/11111111-1111-4111-8111-111111111111/infra-incidents/99999999-9999-4999-8999-999999999999")
      .send(body);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(mockProjectService.getInfraTarget).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "77777777-7777-4777-8777-777777777777",
    );
    expect(mockProjectService.getInfraHealthCheck).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "88888888-8888-4888-8888-888888888888",
    );
    expect(mockIssueService.getById).toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222");
    expect(mockApprovalService.getById).toHaveBeenCalledWith("44444444-4444-4444-8444-444444444444");
    expect(mockProjectService.updateInfraIncident).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "99999999-9999-4999-8999-999999999999",
      body,
    );
  });

  it("rejects cross-company relation IDs when updating infrastructure incidents", async () => {
    const app = await createApp("board");
    const endpoint =
      "/api/projects/11111111-1111-4111-8111-111111111111/infra-incidents/99999999-9999-4999-8999-999999999999";

    mockProjectService.getInfraTarget.mockResolvedValueOnce(buildInfraTarget({ companyId: "other-company" }));
    let res = await request(app)
      .patch(endpoint)
      .send({ infraTargetId: "77777777-7777-4777-8777-777777777777" });
    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(res.body.error).toBe("Infrastructure incident target is invalid");

    mockProjectService.getInfraHealthCheck.mockResolvedValueOnce(buildInfraHealthCheck({ companyId: "other-company" }));
    res = await request(app)
      .patch(endpoint)
      .send({ healthCheckId: "88888888-8888-4888-8888-888888888888" });
    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(res.body.error).toBe("Infrastructure incident health check is invalid");

    mockIssueService.getById.mockResolvedValueOnce(buildIssue({ companyId: "other-company" }));
    res = await request(app)
      .patch(endpoint)
      .send({ issueId: "22222222-2222-4222-8222-222222222222" });
    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(res.body.error).toBe("Infrastructure incident issue is invalid");

    mockApprovalService.getById.mockResolvedValueOnce(buildApproval({
      companyId: "other-company",
      type: "infra_repair",
      payload: { project: { id: "11111111-1111-4111-8111-111111111111" } },
    }));
    res = await request(app)
      .patch(endpoint)
      .send({ repairApprovalId: "44444444-4444-4444-8444-444444444444" });
    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(res.body.error).toBe("Infrastructure incident repair approval is invalid");

    expect(mockProjectService.updateInfraIncident).not.toHaveBeenCalled();
  });

  it("rotates, uses, and revokes external monitor tokens for health checks", async () => {
    const app = await createApp("board");

    const rotateRes = await request(app)
      .post("/api/projects/11111111-1111-4111-8111-111111111111/infra-health-checks/88888888-8888-4888-8888-888888888888/external-monitor-token")
      .send({});

    expect(rotateRes.status, JSON.stringify(rotateRes.body)).toBe(200);
    expect(rotateRes.body).toMatchObject({
      token: "pcmon_test_abcd1234",
      healthCheck: {
        externalMonitorEnabled: true,
        externalMonitorTokenHint: "abcd1234",
      },
    });

    const recordRes = await request(app)
      .post("/api/external/infra-health-checks/88888888-8888-4888-8888-888888888888/results")
      .set("Authorization", "Bearer pcmon_test_abcd1234")
      .send({
        status: "degraded",
        latencyMs: 1400,
        sourceId: "uptime-monitor-1",
        sourceDetail: "External uptime monitor reported slow response",
        sourceMetadata: { region: "iad" },
      });

    expect(recordRes.status, JSON.stringify(recordRes.body)).toBe(200);
    expect(mockProjectService.recordExternalInfraHealthResult).toHaveBeenCalledWith(
      "88888888-8888-4888-8888-888888888888",
      "pcmon_test_abcd1234",
      expect.objectContaining({
        status: "degraded",
        latencyMs: 1400,
        sourceId: "uptime-monitor-1",
      }),
    );
    expect(mockIssueService.create).not.toHaveBeenCalled();
    expect(mockProjectService.createInfraIncident).not.toHaveBeenCalled();
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorType: "system",
        actorId: "external_monitor",
        action: "project.infra_health_result_recorded",
      }),
    );

    const revokeRes = await request(app)
      .delete("/api/projects/11111111-1111-4111-8111-111111111111/infra-health-checks/88888888-8888-4888-8888-888888888888/external-monitor-token");
    expect(revokeRes.status, JSON.stringify(revokeRes.body)).toBe(200);
    expect(mockProjectService.revokeInfraHealthExternalMonitorToken).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "88888888-8888-4888-8888-888888888888",
    );
  });

  it("deletes infra health checks through the board-only route", async () => {
    mockProjectService.removeInfraHealthCheck.mockResolvedValue(buildInfraHealthCheck({
      id: "88888888-8888-4888-8888-888888888888",
      name: "Production HTTP",
    }));

    const res = await request(await createApp("board"))
      .delete("/api/projects/11111111-1111-4111-8111-111111111111/infra-health-checks/88888888-8888-4888-8888-888888888888");

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(mockProjectService.removeInfraHealthCheck).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "88888888-8888-4888-8888-888888888888",
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "project.infra_health_check_deleted",
        companyId: "company-1",
        entityId: "11111111-1111-4111-8111-111111111111",
        details: expect.objectContaining({
          healthCheckId: "88888888-8888-4888-8888-888888888888",
          name: "Production HTTP",
        }),
      }),
    );
  });

  it("rejects external health results without a monitor token", async () => {
    const app = await createApp("board");
    const res = await request(app)
      .post("/api/external/infra-health-checks/88888888-8888-4888-8888-888888888888/results")
      .send({ status: "healthy" });

    expect(res.status, JSON.stringify(res.body)).toBe(401);
    expect(mockProjectService.recordExternalInfraHealthResult).not.toHaveBeenCalled();
  });

  it("rejects secret-looking metadata from external monitor submissions", async () => {
    const app = await createApp("board");
    const res = await request(app)
      .post("/api/external/infra-health-checks/88888888-8888-4888-8888-888888888888/results")
      .set("Authorization", "Bearer pcmon_test_abcd1234")
      .send({
        status: "degraded",
        sourceId: "uptime-monitor-1",
        sourceMetadata: {
          headers: {
            authorization: "Bearer leaked-token",
          },
        },
      });

    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body.error).toBe("Validation error");
    expect(res.body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("Infrastructure metadata must not contain credentials"),
        }),
      ]),
    );
    expect(mockProjectService.recordExternalInfraHealthResult).not.toHaveBeenCalled();
  });

  it("creates approval-gated infra action proposals for open incidents", async () => {
    mockProjectService.listInfraIncidents.mockResolvedValue([buildInfraIncident()]);
    mockApprovalService.create.mockResolvedValue(buildApproval({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      type: "infra_repair",
      status: "pending",
    }));

    const app = await createApp();
    const res = await request(app)
      .post("/api/projects/11111111-1111-4111-8111-111111111111/infra-incidents/99999999-9999-4999-8999-999999999999/action-proposals")
      .send({
        infraTargetId: "77777777-7777-4777-8777-777777777777",
        actionType: "repair",
        summary: "Restart primary service",
        rationale: "Health check is failing.",
        proposedAction: "Restart the service manually.",
        rollbackPlan: "Stop if errors increase.",
        risk: "Restart may interrupt active requests.",
      });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(mockApprovalService.create).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({
        type: "infra_repair",
        requestedByAgentId: "agent-1",
        payload: expect.objectContaining({
          providerMutationAllowed: false,
          actionType: "repair",
          proposedAction: "Restart the service manually.",
        }),
      }),
    );
    expect(mockIssueApprovalService.linkManyForApproval).toHaveBeenCalledWith(
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      ["22222222-2222-4222-8222-222222222222"],
      expect.objectContaining({ agentId: "agent-1" }),
    );
    expect(mockProjectService.createInfraActionProposal).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      expect.objectContaining({
        incidentId: "99999999-9999-4999-8999-999999999999",
        approvalId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        status: "approval_requested",
      }),
    );
  });

  it("blocks infra action evidence until the repair approval is accepted", async () => {
    mockApprovalService.getById.mockResolvedValue(buildApproval({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      type: "infra_repair",
      status: "pending",
    }));

    const app = await createApp();
    const res = await request(app)
      .post("/api/projects/11111111-1111-4111-8111-111111111111/infra-action-proposals/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/evidence")
      .send({
        status: "succeeded",
        evidence: "Service restarted and recovered.",
      });

    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(mockProjectService.createInfraActionEvidence).not.toHaveBeenCalled();
  });

  it("records infra action evidence after repair approval", async () => {
    mockApprovalService.getById.mockResolvedValue(buildApproval({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      type: "infra_repair",
      status: "approved",
      requestedByAgentId: "agent-1",
    }));

    const app = await createApp();
    const res = await request(app)
      .post("/api/projects/11111111-1111-4111-8111-111111111111/infra-action-proposals/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/evidence")
      .send({
        status: "succeeded",
        evidence: "Service restarted and recovered.",
      });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(mockProjectService.createInfraActionEvidence).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      expect.objectContaining({
        proposalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        approvalId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        status: "succeeded",
        evidence: "Service restarted and recovered.",
        recordedByAgentId: "agent-1",
      }),
    );
    expect(mockProjectService.updateInfraActionProposal).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      { status: "succeeded" },
    );
  });

  it("sends a maintenance message only after approval and eligible deploy status", async () => {
    mockProjectService.getDeployEvent.mockResolvedValue(buildDeployEvent({
      status: "deployed",
      maintenanceMessage: "Deploy concluido.",
    }));

    const app = await createApp();
    const res = await request(app)
      .post("/api/projects/11111111-1111-4111-8111-111111111111/deploy-events/55555555-5555-4555-8555-555555555555/maintenance-message")
      .send({});

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(mockSendDeployMaintenanceEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["ops@example.com"],
        projectName: "Project",
        targetName: "Production",
        deployStatus: "deployed",
        message: "Deploy concluido.",
        approvalId: "44444444-4444-4444-8444-444444444444",
      }),
    );
    expect(mockProjectService.recordDeployMaintenanceMessageDelivery).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "55555555-5555-4555-8555-555555555555",
      expect.objectContaining({
        status: "sent",
        recipients: ["ops@example.com"],
      }),
    );
  });

  it("does not send duplicate maintenance messages once sent", async () => {
    mockProjectService.getDeployEvent.mockResolvedValue(buildDeployEvent({
      status: "deployed",
      maintenanceMessage: "Deploy concluido.",
      maintenanceMessageStatus: "sent",
    }));

    const app = await createApp();
    const res = await request(app)
      .post("/api/projects/11111111-1111-4111-8111-111111111111/deploy-events/55555555-5555-4555-8555-555555555555/maintenance-message")
      .send({});

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(mockSendDeployMaintenanceEmail).not.toHaveBeenCalled();
    expect(mockProjectService.recordDeployMaintenanceMessageDelivery).not.toHaveBeenCalled();
  });

  it("requires deployment target opt-in before sending maintenance messages", async () => {
    mockProjectService.getDeployEvent.mockResolvedValue(buildDeployEvent({
      status: "deployed",
      maintenanceMessage: "Deploy concluido.",
    }));
    mockProjectService.getDeploymentTarget.mockResolvedValue(buildTarget({
      maintenanceUpdatesEnabled: false,
      maintenanceRecipients: ["ops@example.com"],
    }));

    const app = await createApp();
    const res = await request(app)
      .post("/api/projects/11111111-1111-4111-8111-111111111111/deploy-events/55555555-5555-4555-8555-555555555555/maintenance-message")
      .send({});

    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(mockSendDeployMaintenanceEmail).not.toHaveBeenCalled();
  });
});
