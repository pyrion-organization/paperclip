import { Router, type Request } from "express";
import type { Db } from "@paperclipai/db";
import {
  createInboundEmailMailboxSchema,
  createInboundEmailRuleSchema,
  importExternalInboundEmailMessageSchema,
  importExternalInboundEmailMessagesBatchSchema,
  importInboundEmailMessageSchema,
  submitExternalInboundEmailIntakeSchema,
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

const EXTERNAL_INTAKE_STATUS_CODES = {
  imported: 201,
  duplicate: 200,
  failed: 202,
} as const;

function inboundEmailActorFromRequest(req: Request): { userId: string | null; agentId: string | null } {
  const actor = getActorInfo(req);
  return {
    userId: actor.actorType === "user" ? actor.actorId : null,
    agentId: actor.agentId ?? null,
  };
}

function pageOptions(req: Request): ListPageOptions {
  const rawLimit = typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : undefined;
  const cursor = typeof req.query.cursor === "string" && req.query.cursor.length > 0 ? req.query.cursor : null;
  return {
    limit: Number.isFinite(rawLimit ?? NaN) ? rawLimit : undefined,
    cursor,
  };
}

function externalIntakeTokenFromRequest(req: Request) {
  const auth = req.header("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice("bearer ".length).trim();
  }
  return req.header("x-paperclip-external-intake-token")?.trim() ?? "";
}

export function inboundEmailRoutes(db: Db, storage?: StorageService) {
  const router = Router();
  const svc = inboundEmailService(db, storage);

  router.post(
    "/external/inbound-email/mailboxes/:mailboxId/intake",
    validate(submitExternalInboundEmailIntakeSchema),
    async (req, res) => {
      const mailboxId = req.params.mailboxId as string;
      const token = externalIntakeTokenFromRequest(req);
      if (!token) {
        res.status(401).json({ error: "External inbound email intake token required" });
        return;
      }

      const result = await svc.submitExternalIntakeMessageWithToken(mailboxId, token, req.body);
      if (!result) {
        res.status(404).json({ error: "Inbound email mailbox not found" });
        return;
      }
      const statusCode = EXTERNAL_INTAKE_STATUS_CODES[result.status as keyof typeof EXTERNAL_INTAKE_STATUS_CODES] ?? 500;
      res.status(statusCode).json(result);
    },
  );

  router.get("/companies/:companyId/inbound-email/mailboxes", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    res.json(await svc.listMailboxes(companyId, pageOptions(req)));
  });

  router.get("/companies/:companyId/inbound-email/ops", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    res.json(await svc.getOpsDashboard(companyId));
  });

  router.post(
    "/companies/:companyId/inbound-email/mailboxes",
    validate(createInboundEmailMailboxSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      assertBoard(req);
      const mailbox = await svc.createMailbox(companyId, req.body, inboundEmailActorFromRequest(req));
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
      res.json(await svc.updateMailbox(companyId, mailboxId, req.body, inboundEmailActorFromRequest(req)));
    },
  );

  router.delete("/companies/:companyId/inbound-email/mailboxes/:mailboxId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const mailboxId = req.params.mailboxId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    await svc.deleteMailbox(companyId, mailboxId, inboundEmailActorFromRequest(req));
    res.status(204).end();
  });

  router.post("/companies/:companyId/inbound-email/mailboxes/:mailboxId/external-intake-token", async (req, res) => {
    const companyId = req.params.companyId as string;
    const mailboxId = req.params.mailboxId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    const result = await svc.rotateExternalIntakeToken(companyId, mailboxId, inboundEmailActorFromRequest(req));
    res.status(201).json(result);
  });

  router.delete("/companies/:companyId/inbound-email/mailboxes/:mailboxId/external-intake-token", async (req, res) => {
    const companyId = req.params.companyId as string;
    const mailboxId = req.params.mailboxId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    const mailbox = await svc.revokeExternalIntakeToken(companyId, mailboxId, inboundEmailActorFromRequest(req));
    res.json(mailbox);
  });

  router.post(
    "/companies/:companyId/inbound-email/messages/:messageId/retry",
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const messageId = req.params.messageId as string;
      assertCompanyAccess(req, companyId);
      assertBoard(req);
      const job = await svc.retryMessage(companyId, messageId, inboundEmailActorFromRequest(req));
      res.status(202).json(job);
    },
  );

  router.post(
    "/companies/:companyId/inbound-email/jobs/:jobId/retry",
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const jobId = req.params.jobId as string;
      assertCompanyAccess(req, companyId);
      assertBoard(req);
      const job = await svc.retryJob(companyId, jobId, inboundEmailActorFromRequest(req));
      res.status(202).json(job);
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
    const job = await svc.enqueueMailboxPoll(companyId, mailboxId, inboundEmailActorFromRequest(req));
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
      res.status(201).json(await svc.createRule(companyId, req.body, inboundEmailActorFromRequest(req)));
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
      res.json(await svc.updateRule(companyId, ruleId, req.body, inboundEmailActorFromRequest(req)));
    },
  );

  router.delete("/companies/:companyId/inbound-email/rules/:ruleId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const ruleId = req.params.ruleId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    await svc.deleteRule(companyId, ruleId, inboundEmailActorFromRequest(req));
    res.status(204).end();
  });

  router.get("/companies/:companyId/inbound-email/messages", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const classificationCategory =
      typeof req.query.classificationCategory === "string" ? req.query.classificationCategory : undefined;
    const classificationReview =
      typeof req.query.classificationReview === "string" ? req.query.classificationReview : undefined;
    const mailboxId = typeof req.query.mailboxId === "string" ? req.query.mailboxId : undefined;
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const order = req.query.order === "desc" ? "desc" : "asc";
    res.json(
      await svc.listMessages(companyId, {
        ...pageOptions(req),
        status,
        classificationCategory,
        classificationReview,
        mailboxId,
        q,
        order,
      }),
    );
  });

  router.get("/companies/:companyId/inbound-email/external-intake", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    const status =
      req.query.status === "imported" || req.query.status === "duplicate" || req.query.status === "failed"
        ? req.query.status
        : undefined;
    const mailboxId = typeof req.query.mailboxId === "string" ? req.query.mailboxId : undefined;
    const order = req.query.order === "desc" ? "desc" : "asc";
    res.json(await svc.listExternalIntakeRecords(companyId, { ...pageOptions(req), status, mailboxId, order }));
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
        actor: inboundEmailActorFromRequest(req),
      });
      const statusCode = SUBMIT_STATUS_CODES[result.status as keyof typeof SUBMIT_STATUS_CODES] ?? 500;
      res.status(statusCode).json(result);
    },
  );

  router.post(
    "/companies/:companyId/inbound-email/external-intake/import",
    validate(importExternalInboundEmailMessageSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      assertBoard(req);
      const result = await svc.submitExternalIntakeMessage(
        companyId,
        req.body,
        inboundEmailActorFromRequest(req),
      );
      const statusCode = EXTERNAL_INTAKE_STATUS_CODES[result.status as keyof typeof EXTERNAL_INTAKE_STATUS_CODES] ?? 500;
      res.status(statusCode).json(result);
    },
  );

  router.post(
    "/companies/:companyId/inbound-email/external-intake/import-batch",
    validate(importExternalInboundEmailMessagesBatchSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      assertBoard(req);
      const result = await svc.submitExternalIntakeMessagesBatch(
        companyId,
        req.body,
        inboundEmailActorFromRequest(req),
      );
      res.status(result.failedCount > 0 ? 207 : 201).json(result);
    },
  );

  return router;
}
