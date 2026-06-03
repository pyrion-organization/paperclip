import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

function createSelectChain(rows: unknown[]) {
  const query = {
    then(resolve: (value: unknown[]) => unknown) {
      return Promise.resolve(rows).then(resolve);
    },
    where() {
      return query;
    },
  };
  return {
    from() {
      return query;
    },
  };
}

function createDbStub(inviteRows: unknown[]) {
  return {
    select() {
      return createSelectChain(inviteRows);
    },
  };
}

function createInvite(overrides: Record<string, unknown> = {}) {
  return {
    id: "invite-1",
    companyId: "company-1",
    inviteType: "company_join",
    allowedJoinTypes: "agent",
    tokenHash: "hash",
    defaultsPayload: null,
    expiresAt: new Date("2027-03-07T00:10:00.000Z"),
    invitedByUserId: null,
    revokedAt: null,
    acceptedAt: null,
    createdAt: new Date("2026-03-07T00:00:00.000Z"),
    updatedAt: new Date("2026-03-07T00:00:00.000Z"),
    ...overrides,
  };
}

async function createApp(
  db: Record<string, unknown>,
  network: {
    lookup: ReturnType<typeof vi.fn>;
    requestHead: ReturnType<typeof vi.fn>;
  },
) {
  const [access, middleware] = await Promise.all([
    import("../routes/access.js"),
    import("../middleware/index.js"),
  ]);
  const app = express();
  app.use((req, _res, next) => {
    (req as any).actor = { type: "anon" };
    next();
  });
  app.use(
    "/api",
    access.accessRoutes(db as any, {
      deploymentMode: "local_trusted",
      deploymentExposure: "private",
      bindHost: "127.0.0.1",
      allowedHostnames: [],
      inviteResolutionNetwork: network,
    }),
  );
  app.use(middleware.errorHandler);
  return app;
}

describe.sequential("GET /invites/:token/test-resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects private, local, multicast, and reserved targets before probing", async () => {
    const cases = [
      ["localhost", "127.0.0.1"],
      ["IPv4 loopback", "127.0.0.1"],
      ["IPv6 loopback", "::1"],
      ["IPv4-mapped IPv6 loopback hex", "::ffff:7f00:1"],
      ["IPv4-mapped IPv6 RFC1918 hex", "::ffff:c0a8:101"],
      ["RFC1918 10/8", "10.0.0.5"],
      ["RFC1918 172.16/12", "172.16.10.5"],
      ["RFC1918 192.168/16", "192.168.1.10"],
      ["link-local metadata", "169.254.169.254"],
      ["multicast", "224.0.0.1"],
      ["NAT64 well-known prefix", "64:ff9b::0a00:0001"],
      ["NAT64 local-use prefix", "64:ff9b:1::0a00:0001"],
    ] as const;

    for (const [label, address] of cases) {
      const lookup = vi.fn().mockResolvedValue([{ address, family: address.includes(":") ? 6 : 4 }]);
      const requestHead = vi.fn();
      const app = await createApp(createDbStub([createInvite()]), { lookup, requestHead });

      const res = await request(app)
        .get("/api/invites/pcp_invite_test/test-resolution")
        .set("Host", "paperclip.example.test")
        .query({ url: "http://paperclip.example.test/api/invites/pcp_invite_test/onboarding" });

      expect(res.status, label).toBe(400);
      expect(res.body.error).toBe(
        "url resolves to a private, local, multicast, or reserved address",
      );
      expect(requestHead).not.toHaveBeenCalled();
    }
  }, 20_000);

  it.sequential("rejects hostnames that resolve to private addresses", async () => {
    const lookup = vi.fn().mockResolvedValue([{ address: "10.1.2.3", family: 4 }]);
    const requestHead = vi.fn();
    const app = await createApp(createDbStub([createInvite()]), { lookup, requestHead });

    const res = await request(app)
      .get("/api/invites/pcp_invite_test/test-resolution")
      .set("Host", "paperclip.example.test")
      .query({ url: "http://paperclip.example.test/api/invites/pcp_invite_test/onboarding" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe(
      "url resolves to a private, local, multicast, or reserved address",
    );
    expect(lookup).toHaveBeenCalledWith("paperclip.example.test");
    expect(requestHead).not.toHaveBeenCalled();
  });

  it.sequential("rejects hostnames when any resolved address is private", async () => {
    const lookup = vi.fn().mockResolvedValue([
      { address: "127.0.0.1", family: 4 },
      { address: "93.184.216.34", family: 4 },
    ]);
    const requestHead = vi.fn();
    const app = await createApp(createDbStub([createInvite()]), { lookup, requestHead });

    const res = await request(app)
      .get("/api/invites/pcp_invite_test/test-resolution")
      .query({ url: "https://mixed.example.test/health" });

    expect(res.status).toBe(400);
    expect(requestHead).not.toHaveBeenCalled();
  });

  it.sequential("allows public HTTPS targets through the resolved and pinned probe path", async () => {
    const lookup = vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const requestHead = vi.fn().mockResolvedValue({ httpStatus: 204 });
    const app = await createApp(createDbStub([createInvite()]), { lookup, requestHead });

    const res = await request(app)
      .get("/api/invites/pcp_invite_test/test-resolution")
      .set("Host", "paperclip.example.test")
      .query({ url: "http://paperclip.example.test/api/invites/pcp_invite_test/onboarding", timeoutMs: "2500" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      inviteId: "invite-1",
      requestedUrl: "http://paperclip.example.test/api/invites/pcp_invite_test/onboarding",
      timeoutMs: 2500,
      status: "reachable",
      method: "HEAD",
      httpStatus: 204,
    });
    expect(requestHead).toHaveBeenCalledWith(
      expect.objectContaining({
        resolvedAddress: "93.184.216.34",
        resolvedAddresses: ["93.184.216.34"],
        hostHeader: "paperclip.example.test",
        tlsServername: undefined,
      }),
      2500,
    );
  });

  it.sequential("rejects arbitrary public targets before probing", async () => {
    const lookup = vi.fn();
    const requestHead = vi.fn();
    const app = await createApp(createDbStub([createInvite()]), { lookup, requestHead });

    const res = await request(app)
      .get("/api/invites/pcp_invite_test/test-resolution")
      .set("Host", "paperclip.example.test")
      .query({ url: "https://gateway.example.test/health" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("url must target this Paperclip invite host");
    expect(lookup).not.toHaveBeenCalled();
    expect(requestHead).not.toHaveBeenCalled();
  });

  it.sequential.each([
    ["missing invite", []],
    ["revoked invite", [createInvite({ revokedAt: new Date("2026-03-07T00:05:00.000Z") })]],
    ["expired invite", [createInvite({ expiresAt: new Date("2020-03-07T00:10:00.000Z") })]],
  ])("returns not found for %s tokens before DNS lookup", async (_label, inviteRows) => {
    const lookup = vi.fn();
    const requestHead = vi.fn();
    const app = await createApp(createDbStub(inviteRows), { lookup, requestHead });

    const res = await request(app)
      .get("/api/invites/pcp_invite_test/test-resolution")
      .query({ url: "https://gateway.example.test/health" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Invite not found");
    expect(lookup).not.toHaveBeenCalled();
    expect(requestHead).not.toHaveBeenCalled();
  });
});
