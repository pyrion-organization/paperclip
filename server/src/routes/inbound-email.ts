import { Router, type Request } from "express";
import type { Db } from "@paperclipai/db";
import {
  createInboundEmailMailboxSchema,
  createInboundEmailRuleSchema,
  importInboundEmailMessageSchema,
  updateInboundEmailMailboxSchema,
  updateInboundEmailRuleSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { inboundEmailService, type ListPageOptions } from "../services/inbound-email.js";
import type { StorageService } from "../storage/types.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";

const SUBMIT_STATUS_CODES = {
  persisted: 201,
  duplicate: 200,
} as const;

function pageOptions(req: Request): ListPageOptions {
  const rawLimit = typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : undefined;
  const cursor = typeof req.query.cursor === "string" && req.query.cursor.length > 0 ? req.query.cursor : null;
  return {
    limit: Number.isFinite(rawLimit ?? NaN) ? rawLimit : undefined,
    cursor,
  };
}

export function inboundEmailRoutes(db: Db, storage?: StorageService) {
  const router = Router();
  const svc = inboundEmailService(db, storage);

  router.get("/companies/:companyId/inbound-email/mailboxes", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    res.json(await svc.listMailboxes(companyId, pageOptions(req)));
  });

  router.post(
    "/companies/:companyId/inbound-email/mailboxes",
    validate(createInboundEmailMailboxSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      assertBoard(req);
      const actor = getActorInfo(req);
      const mailbox = await svc.createMailbox(companyId, req.body, {
        userId: actor.actorType === "user" ? actor.actorId : null,
        agentId: actor.agentId ?? null,
      });
      res.status(201).json(mailbox);
    },
  );

  router.patch(
    "/companies/:companyId/inbound-email/mailboxes/:mailboxId",
    validate(updateInboundEmailMailboxSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const mailboxId = req.params.mailboxId as string;
      assertCompanyAccess(req, companyId);
      assertBoard(req);
      const actor = getActorInfo(req);
      res.json(await svc.updateMailbox(companyId, mailboxId, req.body, {
        userId: actor.actorType === "user" ? actor.actorId : null,
        agentId: actor.agentId ?? null,
      }));
    },
  );

  router.post("/companies/:companyId/inbound-email/mailboxes/:mailboxId/test", async (req, res) => {
    const companyId = req.params.companyId as string;
    const mailboxId = req.params.mailboxId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    await svc.testMailboxConnection(companyId, mailboxId);
    res.json({ ok: true });
  });

  router.post("/companies/:companyId/inbound-email/mailboxes/:mailboxId/poll", async (req, res) => {
    const companyId = req.params.companyId as string;
    const mailboxId = req.params.mailboxId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    const job = await svc.enqueueMailboxPoll(companyId, mailboxId);
    res.status(202).json(job);
  });

  router.get("/companies/:companyId/inbound-email/rules", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    res.json(await svc.listRules(companyId, pageOptions(req)));
  });

  router.post(
    "/companies/:companyId/inbound-email/rules",
    validate(createInboundEmailRuleSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      assertBoard(req);
      res.status(201).json(await svc.createRule(companyId, req.body));
    },
  );

  router.patch(
    "/companies/:companyId/inbound-email/rules/:ruleId",
    validate(updateInboundEmailRuleSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const ruleId = req.params.ruleId as string;
      assertCompanyAccess(req, companyId);
      assertBoard(req);
      res.json(await svc.updateRule(companyId, ruleId, req.body));
    },
  );

  router.get("/companies/:companyId/inbound-email/messages", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    res.json(await svc.listMessages(companyId, status, pageOptions(req)));
  });

  router.get("/companies/:companyId/inbound-email/jobs", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    res.json(await svc.listJobs(companyId, pageOptions(req)));
  });

  router.post(
    "/companies/:companyId/inbound-email/messages/import",
    validate(importInboundEmailMessageSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      assertBoard(req);
      const result = await svc.submitRawMessage({
        companyId,
        mailboxId: req.body.mailboxId,
        providerUid: req.body.providerUid,
        rawEmail: req.body.rawEmail,
        processAfterImport: req.body.processAfterImport,
      });
      const statusCode = SUBMIT_STATUS_CODES[result.status as keyof typeof SUBMIT_STATUS_CODES] ?? 500;
      res.status(statusCode).json(result);
    },
  );

  return router;
}
