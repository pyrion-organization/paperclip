import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockIssueService = vi.hoisted(() => ({
  createLabel: vi.fn(),
  listLabels: vi.fn(),
  getLabelById: vi.fn(),
  deleteLabel: vi.fn(),
}));
const mockLogActivity = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", () => ({
  accessService: () => ({
    canUser: vi.fn(),
    hasPermission: vi.fn(),
  }),
  agentService: () => ({
    getById: vi.fn(),
  }),
  companyService: () => ({
    getById: vi.fn(async () => ({ id: "company-1", attachmentMaxBytes: 10 * 1024 * 1024 })),
  }),
  companySearchService: () => ({}),
  documentAnnotationService: () => ({ remapOpenThreadsForDocument: async () => [] }),
  documentService: () => ({
    getIssueDocumentPayload: vi.fn(async () => ({})),
  }),
  executionWorkspaceService: () => ({
    getById: vi.fn(),
  }),
  feedbackService: () => ({}),
  goalService: () => ({
    getById: vi.fn(),
    getDefaultCompanyGoal: vi.fn(),
  }),
  heartbeatService: () => ({
    reportRunActivity: vi.fn(async () => undefined),
    wakeup: vi.fn(async () => undefined),
  }),
  getIssueContinuationSummaryDocument: vi.fn(async () => null),
  instanceSettingsService: () => ({
    get: vi.fn(),
    listCompanyIds: vi.fn(),
  }),
  issueApprovalService: () => ({}),
  issueReferenceService: () => ({
    deleteDocumentSource: async () => undefined,
    diffIssueReferenceSummary: () => ({
      addedReferencedIssues: [],
      removedReferencedIssues: [],
      currentReferencedIssues: [],
    }),
    emptySummary: () => ({ outbound: [], inbound: [] }),
    listIssueReferenceSummary: async () => ({ outbound: [], inbound: [] }),
    syncComment: async () => undefined,
    syncDocument: async () => undefined,
    syncIssue: async () => undefined,
  }),
  issueRecoveryActionService: () => ({
    getActiveForIssue: vi.fn(async () => null),
    listActiveForIssues: vi.fn(async () => new Map()),
  }),
  issueThreadInteractionService: () => ({
    expireRequestConfirmationsSupersededByComment: vi.fn(async () => []),
    expireStaleRequestConfirmationsForIssueDocument: vi.fn(async () => []),
    listForIssue: vi.fn(async () => []),
  }),
  issueService: () => mockIssueService,
  logActivity: mockLogActivity,
  projectService: () => ({
    getById: vi.fn(),
    listByIds: vi.fn(async () => []),
  }),
  routineService: () => ({
    syncRunStatusForIssue: vi.fn(async () => undefined),
  }),
  workProductService: () => ({
    listForIssue: vi.fn(async () => []),
  }),
}));

function createApp(actor: Record<string, unknown> = {
  type: "board",
  userId: "user-1",
  source: "session",
  companyIds: ["company-1"],
  memberships: [{ companyId: "company-1", status: "active", membershipRole: "admin" }],
}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  return Promise.all([
    import("../routes/issues.js"),
    import("../middleware/index.js"),
  ]).then(([{ issueRoutes }, { errorHandler }]) => {
    app.use("/api", issueRoutes({} as any, {} as any));
    app.use(errorHandler);
    return app;
  });
}

describe("issue label routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIssueService.createLabel.mockResolvedValue({
      id: "label-1",
      companyId: "company-1",
      name: "Backend",
      color: "#2563eb",
      createdAt: new Date("2026-06-06T00:00:00.000Z"),
      updatedAt: new Date("2026-06-06T00:00:00.000Z"),
    });
    mockLogActivity.mockResolvedValue(undefined);
  });

  it("creates issue labels and logs activity", async () => {
    const res = await request(await createApp())
      .post("/api/companies/company-1/labels")
      .send({ name: " Backend ", color: "#2563eb" });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(mockIssueService.createLabel).toHaveBeenCalledWith("company-1", {
      name: "Backend",
      color: "#2563eb",
    });
    expect(mockLogActivity).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      companyId: "company-1",
      actorType: "user",
      actorId: "user-1",
      agentId: null,
      runId: null,
      action: "label.created",
      entityType: "label",
      entityId: "label-1",
      details: { name: "Backend", color: "#2563eb" },
    }));
  }, 15_000);

  it("rejects invalid issue label payloads before service access", async () => {
    const res = await request(await createApp())
      .post("/api/companies/company-1/labels")
      .send({ name: "Backend", color: "blue" });

    expect(res.status).toBe(400);
    expect(mockIssueService.createLabel).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("rejects cross-company issue label creation before service access", async () => {
    const res = await request(await createApp({
      type: "board",
      userId: "user-1",
      source: "session",
      companyIds: ["company-2"],
      memberships: [{ companyId: "company-2", status: "active", membershipRole: "admin" }],
    }))
      .post("/api/companies/company-1/labels")
      .send({ name: "Backend", color: "#2563eb" });

    expect(res.status).toBe(403);
    expect(mockIssueService.createLabel).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });
});
