import { Router } from "express";
import type { Db } from "@paperclipai/db";
import {
  calendarEmailProposalSchema,
  calendarItemFilterSchema,
  completeCalendarItemSchema,
  createCalendarItemDocumentSchema,
  createCalendarItemSchema,
  updateCalendarItemSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { calendarService } from "../services/index.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";

function parseApprovalConfirmed(value: unknown): boolean {
  return value === "true" || value === "1" || value === true;
}

export function calendarRoutes(db: Db) {
  const router = Router();
  const svc = calendarService(db);

  router.get("/companies/:companyId/calendar/items", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const filters = calendarItemFilterSchema.parse(req.query);
    res.json(await svc.list(companyId, filters));
  });

  router.get("/companies/:companyId/calendar/dashboard", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json(await svc.dashboard(companyId));
  });

  router.get("/companies/:companyId/calendar/missing-details", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json(await svc.missingDetails(companyId));
  });

  router.get("/companies/:companyId/calendar/items/:itemId", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json(await svc.getById(companyId, req.params.itemId as string));
  });

  router.post("/companies/:companyId/calendar/items", validate(createCalendarItemSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    const item = await svc.create(companyId, req.body, getActorInfo(req));
    res.status(201).json(item);
  });

  router.post(
    "/companies/:companyId/calendar/email-proposals",
    validate(calendarEmailProposalSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      const item = await svc.createEmailProposal(companyId, req.body, getActorInfo(req));
      res.status(201).json(item);
    },
  );

  router.patch("/companies/:companyId/calendar/items/:itemId", validate(updateCalendarItemSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    const item = await svc.update(
      companyId,
      req.params.itemId as string,
      req.body,
      getActorInfo(req),
      { approvalConfirmed: parseApprovalConfirmed(req.query.approvalConfirmed) },
    );
    res.json(item);
  });

  router.post(
    "/companies/:companyId/calendar/items/:itemId/complete",
    validate(completeCalendarItemSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      assertBoard(req);
      const item = await svc.complete(
        companyId,
        req.params.itemId as string,
        {
          completedAt: req.body.completedAt ? new Date(req.body.completedAt) : undefined,
          nextDueDate: req.body.nextDueDate,
          notes: req.body.notes,
        },
        getActorInfo(req),
        { approvalConfirmed: parseApprovalConfirmed(req.query.approvalConfirmed) },
      );
      res.json(item);
    },
  );

  router.post("/companies/:companyId/calendar/items/:itemId/pause", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    res.json(await svc.setStatus(companyId, req.params.itemId as string, "paused", getActorInfo(req)));
  });

  router.post("/companies/:companyId/calendar/items/:itemId/activate", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    res.json(await svc.setStatus(companyId, req.params.itemId as string, "active", getActorInfo(req)));
  });

  router.post("/companies/:companyId/calendar/items/:itemId/archive", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    res.json(await svc.setStatus(companyId, req.params.itemId as string, "archived", getActorInfo(req)));
  });

  router.post("/companies/:companyId/calendar/items/:itemId/cancel", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    res.json(await svc.setStatus(
      companyId,
      req.params.itemId as string,
      "cancelled",
      getActorInfo(req),
      { approvalConfirmed: parseApprovalConfirmed(req.query.approvalConfirmed) },
    ));
  });

  router.post(
    "/companies/:companyId/calendar/items/:itemId/documents",
    validate(createCalendarItemDocumentSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      assertBoard(req);
      const doc = await svc.addDocument(companyId, req.params.itemId as string, req.body, getActorInfo(req));
      res.status(201).json(doc);
    },
  );

  return router;
}
