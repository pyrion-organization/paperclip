import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { companyRoutes } from "../routes/companies.js";
import { errorHandler } from "../middleware/index.js";

const mockCompanyService = vi.hoisted(() => ({
  list: vi.fn(),
  stats: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  archive: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("../services/index.js", () => ({
  companyService: () => mockCompanyService,
  companyPortabilityService: () => ({
    exportBundle: vi.fn(),
    previewExport: vi.fn(),
    previewImport: vi.fn(),
    importBundle: vi.fn(),
  }),
  accessService: () => ({
    canUser: vi.fn(),
    ensureMembership: vi.fn(),
  }),
  budgetService: () => ({
    upsertPolicy: vi.fn(),
  }),
  agentService: () => ({
    getById: vi.fn(),
  }),
  feedbackService: () => ({
    listIssueVotesForUser: vi.fn(),
    listFeedbackTraces: vi.fn(),
    getFeedbackTraceById: vi.fn(),
    saveIssueVote: vi.fn(),
  }),
  companyInstructionsService: () => ({
    getBundle: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    deleteFile: vi.fn(),
    resolveEntryContent: vi.fn(),
  }),
  logActivity: vi.fn(),
}));

function createApp(actor: Record<string, unknown>) {
  const app = express();
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  app.use("/api/companies", companyRoutes({} as any));
  app.use(errorHandler);
  return app;
}

describe("company routes malformed issue path guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a clear error when companyId is missing for issues list path", async () => {
    const app = createApp({
        type: "agent",
        agentId: "agent-1",
        companyId: "company-1",
        source: "agent_key",
      });

    const res = await request(app).get("/api/companies/issues");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "Missing companyId in path. Use /api/companies/{companyId}/issues.",
    });
  });

  it("filters company stats to board caller company ids", async () => {
    mockCompanyService.stats.mockResolvedValueOnce({
      "company-1": { openIssues: 1 },
      "company-2": { openIssues: 2 },
    });
    const app = createApp({
      type: "board",
      userId: "board-user",
      source: "session",
      companyIds: ["company-1"],
      isInstanceAdmin: false,
    });

    const res = await request(app).get("/api/companies/stats");

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({
      "company-1": { openIssues: 1 },
    });
  });

  it("returns all company stats for local implicit board access", async () => {
    mockCompanyService.stats.mockResolvedValueOnce({
      "company-1": { openIssues: 1 },
      "company-2": { openIssues: 2 },
    });
    const app = createApp({
      type: "board",
      userId: "local-board",
      source: "local_implicit",
      companyIds: [],
      isInstanceAdmin: false,
    });

    const res = await request(app).get("/api/companies/stats");

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({
      "company-1": { openIssues: 1 },
      "company-2": { openIssues: 2 },
    });
  });

  it("rejects company stats for non-board actors", async () => {
    const app = createApp({
      type: "agent",
      agentId: "agent-1",
      companyId: "company-1",
      source: "agent_key",
    });

    const res = await request(app).get("/api/companies/stats");

    expect(res.status).toBe(403);
    expect(mockCompanyService.stats).not.toHaveBeenCalled();
  });
});
