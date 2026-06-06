import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGoalService = vi.hoisted(() => ({
  list: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn());
const mockTrackGoalCreated = vi.hoisted(() => vi.fn());
const mockGetTelemetryClient = vi.hoisted(() => vi.fn());

function registerModuleMocks() {
  vi.doMock("../routes/authz.js", async () => vi.importActual("../routes/authz.js"));
  vi.doMock("@paperclipai/shared/telemetry", () => ({
    trackGoalCreated: mockTrackGoalCreated,
    trackErrorHandlerCrash: vi.fn(),
  }));
  vi.doMock("../telemetry.js", () => ({
    getTelemetryClient: mockGetTelemetryClient,
  }));
  vi.doMock("../services/index.js", () => ({
    goalService: () => mockGoalService,
    logActivity: mockLogActivity,
  }));
}

async function createApp(actor: Record<string, unknown>) {
  const [{ goalRoutes }, { errorHandler }] = await Promise.all([
    import("../routes/goals.js"),
    import("../middleware/index.js"),
  ]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  app.use("/api", goalRoutes({} as any));
  app.use(errorHandler);
  return app;
}

describe("goal routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("../routes/goals.js");
    vi.doUnmock("../routes/authz.js");
    vi.doUnmock("../middleware/index.js");
    vi.doUnmock("@paperclipai/shared/telemetry");
    vi.doUnmock("../telemetry.js");
    vi.doUnmock("../services/index.js");
    registerModuleMocks();
    vi.clearAllMocks();
    mockGetTelemetryClient.mockReturnValue({ track: vi.fn() });
    mockGoalService.getById.mockResolvedValue({
      id: "goal-1",
      companyId: "company-2",
      title: "Other company goal",
    });
    mockGoalService.list.mockResolvedValue([
      { id: "goal-1", companyId: "company-1", title: "Grow" },
    ]);
    mockGoalService.remove.mockResolvedValue({
      id: "goal-1",
      companyId: "company-2",
      title: "Other company goal",
    });
    mockLogActivity.mockResolvedValue(undefined);
  });

  it("lists goals for an authorized company", async () => {
    const app = await createApp({
      type: "board",
      userId: "board-user",
      source: "session",
      companyIds: ["company-1"],
      isInstanceAdmin: false,
    });

    const res = await request(app).get("/api/companies/company-1/goals");

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual([{ id: "goal-1", companyId: "company-1", title: "Grow" }]);
    expect(mockGoalService.list).toHaveBeenCalledWith("company-1");
  });

  it("rejects cross-company goal listing before service access", async () => {
    const app = await createApp({
      type: "board",
      userId: "board-user",
      source: "session",
      companyIds: ["company-2"],
      isInstanceAdmin: false,
    });

    const res = await request(app).get("/api/companies/company-1/goals");

    expect(res.status).toBe(403);
    expect(mockGoalService.list).not.toHaveBeenCalled();
  });

  it("hides cross-company goal existence on delete", async () => {
    const app = await createApp({
      type: "board",
      userId: "board-user",
      source: "session",
      companyIds: ["company-1"],
      isInstanceAdmin: false,
    });

    const res = await request(app).delete("/api/goals/goal-1");

    expect(res.status, JSON.stringify(res.body)).toBe(404);
    expect(res.body.error).toBe("Goal not found");
    expect(mockGoalService.remove).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });
});
