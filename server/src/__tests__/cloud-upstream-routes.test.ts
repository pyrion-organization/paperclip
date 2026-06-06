import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware/index.js";

const mockCloudUpstreamService = vi.hoisted(() => ({
  list: vi.fn(),
  activateRunEntities: vi.fn(),
}));
const mockInstanceSettingsService = vi.hoisted(() => ({
  getExperimental: vi.fn(),
}));

vi.mock("../services/index.js", () => ({
  cloudUpstreamService: () => mockCloudUpstreamService,
  instanceSettingsService: () => mockInstanceSettingsService,
}));

function createApp(companyIds: string[] = ["company-1"]) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.actor = {
      type: "board",
      userId: "user-1",
      source: "session",
      isInstanceAdmin: false,
      companyIds,
      memberships: companyIds.map((companyId) => ({
        companyId,
        status: "active",
        membershipRole: "member",
      })),
    };
    next();
  });
  return import("../routes/cloud-upstreams.js").then(({ cloudUpstreamRoutes }) => {
    app.use("/api", cloudUpstreamRoutes({} as any));
    app.use(errorHandler);
    return app;
  });
}

describe("cloud upstream routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInstanceSettingsService.getExperimental.mockResolvedValue({
      enableCloudSync: true,
    });
    mockCloudUpstreamService.list.mockResolvedValue([
      { id: "connection-1", companyId: "company-1", remoteUrl: "https://cloud.example.test" },
    ]);
    mockCloudUpstreamService.activateRunEntities.mockResolvedValue({
      runId: "run-1",
      activated: { agents: 2, routines: 0, monitors: 0 },
    });
  });

  it("lists cloud upstream connections for an accessible company", async () => {
    const app = await createApp();

    const res = await request(app)
      .get("/api/cloud-upstreams")
      .query({ companyId: "company-1" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: "connection-1", companyId: "company-1", remoteUrl: "https://cloud.example.test" },
    ]);
    expect(mockCloudUpstreamService.list).toHaveBeenCalledWith("company-1");
  });

  it("rejects inaccessible company cloud upstream lists before service access", async () => {
    const app = await createApp(["company-2"]);

    const res = await request(app)
      .get("/api/cloud-upstreams")
      .query({ companyId: "company-1" });

    expect(res.status).toBe(403);
    expect(mockCloudUpstreamService.list).not.toHaveBeenCalled();
  });

  it("activates selected run entities for an accessible company", async () => {
    const app = await createApp();

    const res = await request(app)
      .post("/api/cloud-upstreams/connection-1/push-runs/run-1/activation")
      .send({ companyId: "company-1", entityType: "agents" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      runId: "run-1",
      activated: { agents: 2, routines: 0, monitors: 0 },
    });
    expect(mockCloudUpstreamService.activateRunEntities).toHaveBeenCalledWith({
      connectionId: "connection-1",
      runId: "run-1",
      companyId: "company-1",
      entityType: "agents",
    });
  });

  it("rejects invalid activation entity types before service access", async () => {
    const app = await createApp();

    const res = await request(app)
      .post("/api/cloud-upstreams/connection-1/push-runs/run-1/activation")
      .send({ companyId: "company-1", entityType: "projects" });

    expect(res.status).toBe(400);
    expect(mockCloudUpstreamService.activateRunEntities).not.toHaveBeenCalled();
  });

  it("rejects inaccessible company activation before service access", async () => {
    const app = await createApp(["company-2"]);

    const res = await request(app)
      .post("/api/cloud-upstreams/connection-1/push-runs/run-1/activation")
      .send({ companyId: "company-1", entityType: "agents" });

    expect(res.status).toBe(403);
    expect(mockCloudUpstreamService.activateRunEntities).not.toHaveBeenCalled();
  });
});
