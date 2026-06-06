import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAccessService = vi.hoisted(() => ({
  isInstanceAdmin: vi.fn(),
  listUserCompanyAccess: vi.fn(),
  hasPermission: vi.fn(),
  canUser: vi.fn(),
}));

const mockAgentService = vi.hoisted(() => ({
  getById: vi.fn(),
}));

const mockBoardAuthService = vi.hoisted(() => ({
  createCliAuthChallenge: vi.fn(),
  describeCliAuthChallenge: vi.fn(),
  approveCliAuthChallenge: vi.fn(),
  cancelCliAuthChallenge: vi.fn(),
  resolveBoardAccess: vi.fn(),
  resolveBoardActivityCompanyIds: vi.fn(),
  assertCurrentBoardKey: vi.fn(),
  revokeBoardApiKey: vi.fn(),
}));

const mockInspectBoardClaimChallenge = vi.hoisted(() => vi.fn());
const mockLogActivity = vi.hoisted(() => vi.fn());

function registerModuleMocks() {
  vi.doMock("../routes/authz.js", async () => vi.importActual("../routes/authz.js"));
  vi.doMock("../board-claim.js", () => ({
    claimBoardOwnership: vi.fn(),
    getBoardClaimWarningUrl: vi.fn(),
    initializeBoardClaimChallenge: vi.fn(),
    inspectBoardClaimChallenge: mockInspectBoardClaimChallenge,
  }));
  vi.doMock("../services/index.js", () => ({
    accessService: () => mockAccessService,
    agentService: () => mockAgentService,
    boardAuthService: () => mockBoardAuthService,
    logActivity: mockLogActivity,
    notifyHireApproved: vi.fn(),
    deduplicateAgentName: vi.fn((name: string) => name),
  }));
}

function createDb(selectResults: unknown[][] = []) {
  const queue = [...selectResults];
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve(queue.shift() ?? [])),
      })),
    })),
  };
}

function createAdminUsersDb(input: {
  users: unknown[];
  memberships?: unknown[];
  instanceAdmins?: unknown[];
}) {
  const userQuery = {
    from: vi.fn(() => userQuery),
    where: vi.fn(() => userQuery),
    orderBy: vi.fn(() => userQuery),
    limit: vi.fn(() => Promise.resolve(input.users)),
  };
  const membershipsQuery = {
    from: vi.fn(() => membershipsQuery),
    where: vi.fn(() => Promise.resolve(input.memberships ?? [])),
  };
  const instanceAdminsQuery = {
    from: vi.fn(() => instanceAdminsQuery),
    where: vi.fn(() => Promise.resolve(input.instanceAdmins ?? [])),
  };
  return {
    select: vi.fn()
      .mockReturnValueOnce(userQuery)
      .mockReturnValueOnce(membershipsQuery)
      .mockReturnValueOnce(instanceAdminsQuery),
    userQuery,
    membershipsQuery,
    instanceAdminsQuery,
  };
}

async function createApp(actor: Record<string, unknown>, db: any = createDb()) {
  const [{ accessRoutes }, { errorHandler }] = await Promise.all([
    import("../routes/access.js"),
    import("../middleware/index.js"),
  ]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  app.use("/api", accessRoutes(db, {
    deploymentMode: "authenticated",
    deploymentExposure: "private",
    bindHost: "127.0.0.1",
    allowedHostnames: [],
  }));
  app.use(errorHandler);
  return app;
}

describe("access admin and board claim routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("../routes/access.js");
    vi.doUnmock("../routes/authz.js");
    vi.doUnmock("../middleware/index.js");
    vi.doUnmock("../board-claim.js");
    vi.doUnmock("../services/index.js");
    registerModuleMocks();
    vi.clearAllMocks();
    mockAccessService.isInstanceAdmin.mockResolvedValue(false);
    mockAccessService.listUserCompanyAccess.mockResolvedValue([]);
    mockInspectBoardClaimChallenge.mockReturnValue({
      status: "available",
      requiresSignIn: true,
      expiresAt: "2026-06-04T00:00:00.000Z",
      claimedByUserId: null,
    });
  });

  it("inspects board claim challenges by token and code", async () => {
    const app = await createApp({ type: "none", source: "none" });

    const res = await request(app).get("/api/board-claim/token-1?code=code-1");

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(mockInspectBoardClaimChallenge).toHaveBeenCalledWith("token-1", "code-1");
    expect(res.body).toMatchObject({
      status: "available",
      requiresSignIn: true,
    });
  });

  it("returns instance-admin company access details for a user", async () => {
    mockAccessService.isInstanceAdmin.mockResolvedValue(true);
    mockAccessService.listUserCompanyAccess.mockResolvedValue([{
      companyId: "company-1",
      membershipId: "membership-1",
      membershipRole: "owner",
      status: "active",
    }]);
    const db = createDb([
      [{ id: "user-1", email: "user@example.com", name: "User One", image: null }],
      [{ id: "company-1", name: "Acme", status: "active" }],
    ]);
    const app = await createApp({
      type: "board",
      userId: "admin-user",
      source: "session",
      companyIds: [],
      isInstanceAdmin: true,
    }, db);

    const res = await request(app).get("/api/admin/users/user-1/company-access");

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(mockAccessService.listUserCompanyAccess).toHaveBeenCalledWith("user-1");
    expect(mockAccessService.isInstanceAdmin).toHaveBeenCalledWith("user-1");
    expect(res.body.user).toMatchObject({
      id: "user-1",
      email: "user@example.com",
      isInstanceAdmin: true,
    });
    expect(res.body.companyAccess).toEqual([
      expect.objectContaining({
        companyId: "company-1",
        principalType: "user",
        companyName: "Acme",
        companyStatus: "active",
      }),
    ]);
  });

  it("lists admin users with SQL limit and bulk instance-admin lookup", async () => {
    mockAccessService.isInstanceAdmin.mockResolvedValue(true);
    const db = createAdminUsersDb({
      users: [
        { id: "user-1", email: "one@example.com", name: "User One", image: null },
        { id: "user-2", email: "two@example.com", name: "User Two", image: null },
      ],
      memberships: [
        { principalId: "user-1" },
        { principalId: "user-1" },
        { principalId: "user-2" },
      ],
      instanceAdmins: [{ userId: "user-2" }],
    });
    const app = await createApp({
      type: "board",
      userId: "admin-user",
      source: "session",
      companyIds: [],
      isInstanceAdmin: true,
    }, db);

    const res = await request(app).get("/api/admin/users?query=example");

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(db.userQuery.where).toHaveBeenCalled();
    expect(db.userQuery.limit).toHaveBeenCalledWith(50);
    expect(db.select).toHaveBeenCalledTimes(3);
    expect(mockAccessService.isInstanceAdmin).toHaveBeenCalledTimes(1);
    expect(res.body).toEqual([
      expect.objectContaining({
        id: "user-1",
        isInstanceAdmin: false,
        activeCompanyMembershipCount: 2,
      }),
      expect.objectContaining({
        id: "user-2",
        isInstanceAdmin: true,
        activeCompanyMembershipCount: 1,
      }),
    ]);
  });
});
