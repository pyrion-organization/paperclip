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
}));
const mockLogActivity = vi.hoisted(() => vi.fn());
const mockSendDeployMaintenanceEmail = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", () => ({
  environmentService: () => ({ getById: vi.fn() }),
  initWorkspaceGit: vi.fn(),
  logActivity: mockLogActivity,
  projectFilesService: () => ({}),
  projectService: () => mockProjectService,
  secretService: () => ({}),
  workspaceOperationService: () => ({}),
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

async function createApp() {
  const [{ projectRoutes }, { errorHandler }] = await Promise.all([
    import("../routes/projects.js"),
    import("../middleware/index.js"),
  ]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = {
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
    mockProjectService.recordDeployMaintenanceMessageDelivery.mockImplementation(async (_projectId, _eventId, data) =>
      buildDeployEvent({
        maintenanceMessageStatus: data.status,
        maintenanceMessageRecipients: data.recipients,
      }),
    );
    mockIssueService.getById.mockResolvedValue(buildIssue());
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
