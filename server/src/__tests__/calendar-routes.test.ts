import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { calendarRoutes } from "../routes/calendar.js";
import { errorHandler } from "../middleware/index.js";

const mockCalendarService = vi.hoisted(() => ({
  list: vi.fn(),
  dashboard: vi.fn(),
  missingDetails: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  createEmailProposal: vi.fn(),
  update: vi.fn(),
  complete: vi.fn(),
  setStatus: vi.fn(),
  addDocument: vi.fn(),
}));

vi.mock("../services/index.js", () => ({
  calendarService: () => mockCalendarService,
}));

function appForActor(actor: Express.Request["actor"]) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.actor = actor;
    next();
  });
  app.use("/api", calendarRoutes({} as any));
  app.use(errorHandler);
  return app;
}

const boardActor: Express.Request["actor"] = {
  type: "board",
  userId: "user-1",
  source: "user_session",
  companyIds: ["company-1"],
  memberships: [{ companyId: "company-1", status: "active", membershipRole: "member" }],
};

const agentActor: Express.Request["actor"] = {
  type: "agent",
  agentId: "agent-1",
  companyId: "company-1",
  runId: "11111111-1111-4111-8111-111111111111",
};

describe("calendar routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCalendarService.list.mockResolvedValue({ items: [], total: 0 });
    mockCalendarService.dashboard.mockResolvedValue({ companyId: "company-1" });
    mockCalendarService.missingDetails.mockResolvedValue([]);
    mockCalendarService.getById.mockResolvedValue({ id: "item-1", companyId: "company-1", documents: [], activity: [] });
    mockCalendarService.create.mockResolvedValue({ id: "item-1", companyId: "company-1" });
    mockCalendarService.createEmailProposal.mockResolvedValue({ id: "item-1", companyId: "company-1", status: "pending_review" });
    mockCalendarService.update.mockResolvedValue({ id: "item-1", companyId: "company-1" });
    mockCalendarService.complete.mockResolvedValue({ id: "item-1", companyId: "company-1" });
    mockCalendarService.setStatus.mockResolvedValue({ id: "item-1", companyId: "company-1" });
    mockCalendarService.addDocument.mockResolvedValue({ id: "doc-1", companyId: "company-1" });
  });

  it("passes company-scoped list filters through shared validation", async () => {
    const res = await request(appForActor(boardActor))
      .get("/api/companies/company-1/calendar/items")
      .query({
        category: "domain",
        riskLevel: "critical",
        autoRenew: "true",
        paymentMethod: "card",
        purchaseEmail: "OPS@EXAMPLE.COM",
        billingEmail: "BILLING@EXAMPLE.COM",
        relatedClientId: "22222222-2222-4222-8222-222222222222",
        relatedProjectId: "33333333-3333-4333-8333-333333333333",
        q: "missing critical",
      });

    expect(res.status).toBe(200);
    expect(mockCalendarService.list).toHaveBeenCalledWith("company-1", expect.objectContaining({
      category: "domain",
      riskLevel: "critical",
      autoRenew: true,
      paymentMethod: "card",
      purchaseEmail: "ops@example.com",
      billingEmail: "billing@example.com",
      relatedClientId: "22222222-2222-4222-8222-222222222222",
      relatedProjectId: "33333333-3333-4333-8333-333333333333",
      q: "missing critical",
    }));
  });

  it("parses false auto-renew list filters without truthy string coercion", async () => {
    const res = await request(appForActor(boardActor))
      .get("/api/companies/company-1/calendar/items")
      .query({ autoRenew: "false" });

    expect(res.status).toBe(200);
    expect(mockCalendarService.list).toHaveBeenCalledWith("company-1", expect.objectContaining({
      autoRenew: false,
    }));
  });

  it("exposes missing details without the old missing metadata alias", async () => {
    const detailsRes = await request(appForActor(boardActor))
      .get("/api/companies/company-1/calendar/missing-details");
    const metadataRes = await request(appForActor(boardActor))
      .get("/api/companies/company-1/calendar/missing-metadata");

    expect(detailsRes.status).toBe(200);
    expect(metadataRes.status).toBe(404);
    expect(mockCalendarService.missingDetails).toHaveBeenCalledWith("company-1");
  });

  it("does not expose manual calendar scan routes", async () => {
    const reminderRes = await request(appForActor(boardActor))
      .post("/api/companies/company-1/calendar/run-reminder-scan")
      .send({ sendEmail: true });
    const metadataRes = await request(appForActor(boardActor))
      .post("/api/companies/company-1/calendar/run-metadata-scan")
      .send({});

    expect(reminderRes.status).toBe(404);
    expect(metadataRes.status).toBe(404);
  });

  it("allows same-company agents to create pending review email proposals", async () => {
    const res = await request(appForActor(agentActor))
      .post("/api/companies/company-1/calendar/email-proposals")
      .send({
        title: "Renewal proposal",
        category: "software_subscription",
        sourceEmailMessageId: "44444444-4444-4444-8444-444444444444",
        confidenceScore: 70,
      });

    expect(res.status).toBe(201);
    expect(mockCalendarService.createEmailProposal).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({ title: "Renewal proposal", status: "active" }),
      expect.objectContaining({ actorType: "agent", agentId: "agent-1" }),
    );
  });

  it("passes board user attribution to calendar item creation", async () => {
    const res = await request(appForActor(boardActor))
      .post("/api/companies/company-1/calendar/items")
      .send({ title: "Renew domain", category: "domain" });

    expect(res.status).toBe(201);
    expect(mockCalendarService.create).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({ title: "Renew domain" }),
      expect.objectContaining({
        actorType: "user",
        actorId: "user-1",
        userId: "user-1",
      }),
    );
  });

  it("rejects agent direct item mutations", async () => {
    const res = await request(appForActor(agentActor))
      .post("/api/companies/company-1/calendar/items")
      .send({ title: "Direct item", category: "domain" });

    expect(res.status).toBe(403);
    expect(mockCalendarService.create).not.toHaveBeenCalled();
  });

  it("passes explicit approval confirmation to governed updates", async () => {
    const res = await request(appForActor(boardActor))
      .patch("/api/companies/company-1/calendar/items/item-1?approvalConfirmed=true")
      .send({ nextDueDate: "2026-06-30" });

    expect(res.status).toBe(200);
    expect(mockCalendarService.update).toHaveBeenCalledWith(
      "company-1",
      "item-1",
      expect.objectContaining({ nextDueDate: "2026-06-30" }),
      expect.objectContaining({ actorType: "user", actorId: "user-1", userId: "user-1" }),
      { approvalConfirmed: true },
    );
  });

  it("rejects cross-company agent reads before service access", async () => {
    const res = await request(appForActor(agentActor))
      .get("/api/companies/company-2/calendar/items");

    expect(res.status).toBe(403);
    expect(mockCalendarService.list).not.toHaveBeenCalled();
  });
});
