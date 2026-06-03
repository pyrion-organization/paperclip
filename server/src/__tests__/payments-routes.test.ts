import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { unprocessable } from "../errors.js";
import { errorHandler } from "../middleware/index.js";
import { paymentRoutes } from "../routes/payments.js";

const mockPayments = vi.hoisted(() => ({
  dashboard: vi.fn(),
  listProfiles: vi.fn(),
  createProfile: vi.fn(),
  updateProfile: vi.fn(),
  listEntries: vi.fn(),
  getEntry: vi.fn(),
  createEntry: vi.fn(),
  updateEntry: vi.fn(),
  recordPayment: vi.fn(),
  updateRecord: vi.fn(),
  deleteRecord: vi.fn(),
}));
const mockCalendar = vi.hoisted(() => ({
  getById: vi.fn(),
  complete: vi.fn(),
}));
const mockLogActivity = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", () => ({
  paymentService: () => mockPayments,
  calendarService: () => mockCalendar,
  logActivity: mockLogActivity,
}));

function appForActor(actor: Express.Request["actor"]) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.actor = actor;
    next();
  });
  app.use("/api", paymentRoutes({} as any));
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

describe("payment routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPayments.dashboard.mockResolvedValue({ companyId: "company-1" });
    mockPayments.listProfiles.mockResolvedValue([]);
    mockPayments.createProfile.mockResolvedValue({ id: "profile-1", method: "pix", accountLabel: "PIX" });
    mockPayments.updateProfile.mockResolvedValue({ id: "profile-1", method: "pix", accountLabel: "PIX" });
    mockPayments.listEntries.mockResolvedValue({ entries: [], total: 0 });
    mockPayments.getEntry.mockResolvedValue({
      id: "entry-1",
      calendarItemId: "calendar-1",
      expectedAmountCents: 10000,
      paidAmountCents: 0,
      status: "open",
      records: [],
    });
    mockPayments.createEntry.mockResolvedValue({ id: "entry-1", calendarItemId: null, expectedAmountCents: 10000 });
    mockPayments.updateEntry.mockResolvedValue({
      id: "entry-1",
      calendarItemId: null,
      expectedAmountCents: 10000,
      status: "cancelled",
    });
    mockPayments.recordPayment.mockResolvedValue({
      completed: true,
      entry: {
        id: "entry-1",
        calendarItemId: "calendar-1",
        status: "paid",
        currency: "BRL",
      },
    });
    mockPayments.updateRecord.mockResolvedValue({
      completed: false,
      entry: { id: "entry-1", calendarItemId: "calendar-1", status: "partially_paid", currency: "BRL", paidAmountCents: 4000 },
    });
    mockPayments.deleteRecord.mockResolvedValue({
      entry: { id: "entry-1", calendarItemId: "calendar-1", status: "open", currency: "BRL", paidAmountCents: 0 },
    });
    mockLogActivity.mockResolvedValue(undefined);
    mockCalendar.getById.mockResolvedValue({ id: "calendar-1", riskLevel: "medium" });
    mockCalendar.complete.mockResolvedValue({ id: "calendar-1", status: "done" });
  });

  it("records linked payments and completes the calendar item", async () => {
    const res = await request(appForActor(boardActor))
      .post("/api/companies/company-1/payments/entries/entry-1/records")
      .send({
        amountCents: 10000,
        currency: "BRL",
        paidAt: "2026-06-15T10:00:00.000Z",
      });

    expect(res.status).toBe(201);
    expect(mockPayments.recordPayment).toHaveBeenCalledWith(
      "company-1",
      "entry-1",
      expect.objectContaining({ amountCents: 10000, currency: "BRL" }),
    );
    expect(mockCalendar.complete).toHaveBeenCalledWith(
      "company-1",
      "calendar-1",
      expect.objectContaining({
        completedAt: new Date("2026-06-15T10:00:00.000Z"),
        notes: "Payment recorded: 100.00 BRL",
      }),
      expect.objectContaining({ actorType: "user", actorId: "user-1", userId: "user-1" }),
      { approvalConfirmed: false },
    );
  });

  it("requires explicit approval before completing high-risk linked payments", async () => {
    mockPayments.recordPayment.mockRejectedValueOnce(
      unprocessable("Completing high-risk or critical items requires approval confirmation"),
    );

    const rejected = await request(appForActor(boardActor))
      .post("/api/companies/company-1/payments/entries/entry-1/records")
      .send({
        amountCents: 10000,
        currency: "BRL",
        paidAt: "2026-06-15T10:00:00.000Z",
      });

    expect(rejected.status).toBe(422);
    expect(mockPayments.recordPayment).toHaveBeenCalledWith(
      "company-1",
      "entry-1",
      expect.objectContaining({ approvalConfirmed: false }),
    );
    expect(mockCalendar.complete).not.toHaveBeenCalled();

    const approved = await request(appForActor(boardActor))
      .post("/api/companies/company-1/payments/entries/entry-1/records")
      .send({
        amountCents: 10000,
        currency: "BRL",
        paidAt: "2026-06-15T10:00:00.000Z",
        approvalConfirmed: true,
      });

    expect(approved.status).toBe(201);
    expect(mockCalendar.complete).toHaveBeenCalledWith(
      "company-1",
      "calendar-1",
      expect.anything(),
      expect.objectContaining({ actorType: "user", actorId: "user-1", userId: "user-1" }),
      { approvalConfirmed: true },
    );
  });

  it("updates a payment record and completes the calendar item when it becomes paid", async () => {
    mockPayments.updateRecord.mockResolvedValueOnce({
      completed: true,
      entry: { id: "entry-1", calendarItemId: "calendar-1", status: "paid", currency: "BRL", paidAmountCents: 10000 },
    });

    const res = await request(appForActor(boardActor))
      .patch("/api/companies/company-1/payments/entries/entry-1/records/record-1")
      .send({ amountCents: 10000, approvalConfirmed: true });

    expect(res.status).toBe(200);
    expect(mockPayments.updateRecord).toHaveBeenCalledWith(
      "company-1",
      "entry-1",
      "record-1",
      expect.objectContaining({ amountCents: 10000, approvalConfirmed: true }),
    );
    expect(mockCalendar.complete).toHaveBeenCalledWith(
      "company-1",
      "calendar-1",
      expect.anything(),
      expect.objectContaining({ actorType: "user", actorId: "user-1" }),
      { approvalConfirmed: true },
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "payment_record.updated", entityType: "payment_entry", entityId: "entry-1" }),
    );
  });

  it("deletes a payment record and logs the activity", async () => {
    const res = await request(appForActor(boardActor))
      .delete("/api/companies/company-1/payments/entries/entry-1/records/record-1");

    expect(res.status).toBe(200);
    expect(mockPayments.deleteRecord).toHaveBeenCalledWith("company-1", "entry-1", "record-1");
    expect(mockCalendar.complete).not.toHaveBeenCalled();
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "payment_record.deleted", entityType: "payment_entry", entityId: "entry-1" }),
    );
  });

  it("rejects agent record edits and deletes", async () => {
    const patchRes = await request(appForActor(agentActor))
      .patch("/api/companies/company-1/payments/entries/entry-1/records/record-1")
      .send({ amountCents: 100 });
    const deleteRes = await request(appForActor(agentActor))
      .delete("/api/companies/company-1/payments/entries/entry-1/records/record-1");

    expect(patchRes.status).toBe(403);
    expect(deleteRes.status).toBe(403);
    expect(mockPayments.updateRecord).not.toHaveBeenCalled();
    expect(mockPayments.deleteRecord).not.toHaveBeenCalled();
  });

  it("rejects agent payment mutations", async () => {
    const res = await request(appForActor(agentActor))
      .post("/api/companies/company-1/payments/entries")
      .send({ title: "Cloud invoice", expectedAmountCents: 10000 });

    expect(res.status).toBe(403);
    expect(mockPayments.createEntry).not.toHaveBeenCalled();
  });

  it("logs payment profile updates", async () => {
    const res = await request(appForActor(boardActor))
      .patch("/api/companies/company-1/payments/profiles/profile-1")
      .send({ notes: "Updated profile" });

    expect(res.status).toBe(200);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        companyId: "company-1",
        actorType: "user",
        actorId: "user-1",
        action: "payment_profile.updated",
        entityType: "payment_profile",
        entityId: "profile-1",
        details: expect.objectContaining({ changedKeys: ["notes"] }),
      }),
    );
  });

  it("logs payment entry updates and cancellations", async () => {
    mockPayments.updateEntry
      .mockResolvedValueOnce({
        id: "entry-1",
        calendarItemId: "calendar-1",
        expectedAmountCents: 4000,
        status: "paid",
      })
      .mockResolvedValueOnce({
        id: "entry-1",
        calendarItemId: "calendar-1",
        expectedAmountCents: 4000,
        status: "cancelled",
      });

    const updateRes = await request(appForActor(boardActor))
      .patch("/api/companies/company-1/payments/entries/entry-1")
      .send({ expectedAmountCents: 4000 });
    const cancelRes = await request(appForActor(boardActor))
      .post("/api/companies/company-1/payments/entries/entry-1/cancel")
      .send({});

    expect(updateRes.status).toBe(200);
    expect(cancelRes.status).toBe(200);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "payment_entry.updated",
        entityType: "payment_entry",
        entityId: "entry-1",
        details: expect.objectContaining({
          changedKeys: ["expectedAmountCents"],
          status: "paid",
          expectedAmountCents: 4000,
          calendarItemId: "calendar-1",
        }),
      }),
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "payment_entry.cancelled",
        entityType: "payment_entry",
        entityId: "entry-1",
        details: expect.objectContaining({
          status: "cancelled",
          calendarItemId: "calendar-1",
        }),
      }),
    );
  });
});
