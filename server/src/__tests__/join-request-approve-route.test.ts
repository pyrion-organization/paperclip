import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  activityLog,
  companies,
  companyMemberships,
  createDb,
  invites,
  joinRequests,
  principalPermissionGrants,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { accessRoutes } from "../routes/access.js";
import { errorHandler } from "../middleware/index.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres join request approval route tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("POST /companies/:companyId/join-requests/:requestId/approve", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-join-approve-route-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.delete(activityLog);
    await db.delete(principalPermissionGrants);
    await db.delete(companyMemberships);
    await db.delete(joinRequests);
    await db.delete(invites);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  function createApp(companyId: string) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).actor = {
        type: "board",
        source: "local_implicit",
        userId: "approver-user",
        companyIds: [companyId],
      };
      next();
    });
    app.use(
      "/api",
      accessRoutes(db, {
        deploymentMode: "local_trusted",
        deploymentExposure: "private",
        bindHost: "127.0.0.1",
        allowedHostnames: [],
      }),
    );
    app.use(errorHandler);
    return app;
  }

  it("allows only one concurrent approval to claim a pending join request", async () => {
    const companyId = randomUUID();
    const inviteId = randomUUID();
    const requestId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    await db.insert(invites).values({
      id: inviteId,
      companyId,
      inviteType: "company_join",
      tokenHash: "invite-token-hash",
      allowedJoinTypes: "human",
      defaultsPayload: { humanRole: "viewer" },
      expiresAt: new Date("2027-01-01T00:00:00.000Z"),
      createdAt: new Date("2026-06-04T00:00:00.000Z"),
      updatedAt: new Date("2026-06-04T00:00:00.000Z"),
    });
    await db.insert(joinRequests).values({
      id: requestId,
      inviteId,
      companyId,
      requestType: "human",
      status: "pending_approval",
      requestingUserId: "joining-user",
      requestIp: "127.0.0.1",
      requestEmailSnapshot: "joining@example.com",
      createdAt: new Date("2026-06-04T00:00:00.000Z"),
      updatedAt: new Date("2026-06-04T00:00:00.000Z"),
    });

    const app = createApp(companyId);
    const [left, right] = await Promise.all([
      request(app).post(`/api/companies/${companyId}/join-requests/${requestId}/approve`).send({}),
      request(app).post(`/api/companies/${companyId}/join-requests/${requestId}/approve`).send({}),
    ]);

    expect([left.status, right.status].sort()).toEqual([200, 409]);

    const [joinRequest] = await db.select().from(joinRequests);
    expect(joinRequest).toMatchObject({
      id: requestId,
      status: "approved",
      approvedByUserId: "approver-user",
    });

    const memberships = await db.select().from(companyMemberships);
    expect(memberships).toHaveLength(1);
    expect(memberships[0]).toMatchObject({
      companyId,
      principalType: "user",
      principalId: "joining-user",
      membershipRole: "operator",
      status: "active",
    });

    const activities = await db.select().from(activityLog);
    expect(activities.filter((entry) => entry.action === "join.approved")).toHaveLength(1);
  });
});
