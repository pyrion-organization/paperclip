import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware/index.js";

const mockCloudUpstreamService = vi.hoisted(() => ({
  list: vi.fn(),
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
});
