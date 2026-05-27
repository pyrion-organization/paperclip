import { Router } from "express";
import type { Db } from "@paperclipai/db";
import {
  createPaymentEntrySchema,
  paymentEntryFilterSchema,
  paymentProfileInputSchema,
  recordPaymentSchema,
  updatePaymentEntrySchema,
  updatePaymentProfileSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";
import { calendarService, logActivity, paymentService } from "../services/index.js";

export function paymentRoutes(db: Db) {
  const router = Router();
  const payments = paymentService(db);
  const calendar = calendarService(db);

  router.get("/companies/:companyId/payments/dashboard", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json(await payments.dashboard(companyId));
  });

  router.get("/companies/:companyId/payments/profiles", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json(await payments.listProfiles(companyId));
  });

  router.post("/companies/:companyId/payments/profiles", validate(paymentProfileInputSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    const profile = await payments.createProfile(companyId, req.body);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "payment_profile.created",
      entityType: "payment_profile",
      entityId: profile.id,
      details: { method: profile.method, accountLabel: profile.accountLabel },
    });
    res.status(201).json(profile);
  });

  router.patch("/companies/:companyId/payments/profiles/:profileId", validate(updatePaymentProfileSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    const profile = await payments.updateProfile(companyId, req.params.profileId as string, req.body);
    res.json(profile);
  });

  router.get("/companies/:companyId/payments/entries", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const filters = paymentEntryFilterSchema.parse(req.query);
    res.json(await payments.listEntries(companyId, filters));
  });

  router.get("/companies/:companyId/payments/entries/:entryId", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json(await payments.getEntry(companyId, req.params.entryId as string));
  });

  router.post("/companies/:companyId/payments/entries", validate(createPaymentEntrySchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    const entry = await payments.createEntry(companyId, req.body);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "payment_entry.created",
      entityType: "payment_entry",
      entityId: entry.id,
      details: { calendarItemId: entry.calendarItemId, expectedAmountCents: entry.expectedAmountCents },
    });
    res.status(201).json(entry);
  });

  router.patch("/companies/:companyId/payments/entries/:entryId", validate(updatePaymentEntrySchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    res.json(await payments.updateEntry(companyId, req.params.entryId as string, req.body));
  });

  router.post("/companies/:companyId/payments/entries/:entryId/cancel", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    res.json(await payments.updateEntry(companyId, req.params.entryId as string, { status: "cancelled" }));
  });

  router.post("/companies/:companyId/payments/entries/:entryId/records", validate(recordPaymentSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    const result = await payments.recordPayment(companyId, req.params.entryId as string, req.body);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "payment_record.created",
      entityType: "payment_entry",
      entityId: result.entry.id,
      details: {
        amountCents: req.body.amountCents,
        status: result.entry.status,
        calendarItemId: result.entry.calendarItemId,
      },
    });
    if (result.completed && result.entry.calendarItemId) {
      await calendar.complete(
        companyId,
        result.entry.calendarItemId,
        {
          completedAt: req.body.paidAt ? new Date(req.body.paidAt) : new Date(),
          notes: `Payment recorded: ${(req.body.amountCents / 100).toFixed(2)} ${req.body.currency ?? result.entry.currency}`,
        },
        actor,
        { approvalConfirmed: true },
      );
    }
    res.status(201).json(result.entry);
  });

  return router;
}
