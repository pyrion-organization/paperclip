import { Router, type Request } from "express";
import type { Db } from "@paperclipai/db";
import { cloudUpstreamConnections } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { badRequest, notFound } from "../errors.js";
import { assertBoardOrgAccess, assertCompanyAccess } from "./authz.js";
import { cloudUpstreamService, instanceSettingsService } from "../services/index.js";

export function cloudUpstreamRoutes(db: Db, options: { instanceId?: string } = {}) {
  const router = Router();
  const service = cloudUpstreamService(db, options);
  const settings = instanceSettingsService(db);

  async function assertEnabled() {
    const experimental = await settings.getExperimental();
    if (experimental.enableCloudSync !== true) {
      throw notFound("Cloud sync is not enabled");
    }
  }

  function assertCloudCompanyAccess(req: Request, companyId: string) {
    assertBoardOrgAccess(req);
    assertCompanyAccess(req, companyId);
  }

  async function connectionCompanyId(connectionId: string): Promise<string> {
    const row = await db
      .select({ companyId: cloudUpstreamConnections.companyId })
      .from(cloudUpstreamConnections)
      .where(eq(cloudUpstreamConnections.id, connectionId))
      .then((rows) => rows[0] ?? null);
    if (!row) throw notFound("Cloud upstream connection was not found");
    return row.companyId;
  }

  router.get("/cloud-upstreams", async (req, res) => {
    const companyId = stringQuery(req.query.companyId, "companyId");
    await assertCloudCompanyAccess(req, companyId);
    await assertEnabled();
    res.json(await service.list(companyId));
  });

  router.post("/cloud-upstreams/connect/start", async (req, res) => {
    const companyId = stringBody(req.body, "companyId");
    await assertCloudCompanyAccess(req, companyId);
    await assertEnabled();
    const remoteUrl = stringBody(req.body, "remoteUrl");
    const redirectUri = stringBody(req.body, "redirectUri");
    res.json(await service.startConnect({ companyId, remoteUrl, redirectUri }));
  });

  router.post("/cloud-upstreams/connect/finish", async (req, res) => {
    const pendingConnectionId = stringBody(req.body, "pendingConnectionId");
    await assertCloudCompanyAccess(req, await connectionCompanyId(pendingConnectionId));
    await assertEnabled();
    res.json(await service.finishConnect({
      pendingConnectionId,
      code: stringBody(req.body, "code"),
      state: stringBody(req.body, "state"),
    }));
  });

  router.post("/cloud-upstreams/:connectionId/push-runs/preview", async (req, res) => {
    const companyId = stringBody(req.body, "companyId");
    await assertCloudCompanyAccess(req, companyId);
    await assertEnabled();
    res.json(await service.preview(req.params.connectionId, companyId));
  });

  router.post("/cloud-upstreams/:connectionId/push-runs", async (req, res) => {
    const companyId = stringBody(req.body, "companyId");
    await assertCloudCompanyAccess(req, companyId);
    await assertEnabled();
    res.json(await service.createRun({
      connectionId: req.params.connectionId,
      companyId,
      retryOfRunId: optionalString(req.body?.retryOfRunId),
    }));
  });

  router.get("/cloud-upstreams/:connectionId/push-runs/:runId", async (req, res) => {
    const companyId = stringQuery(req.query.companyId, "companyId");
    await assertCloudCompanyAccess(req, companyId);
    await assertEnabled();
    res.json(await service.readRun(req.params.connectionId, req.params.runId, companyId));
  });

  router.post("/cloud-upstreams/:connectionId/push-runs/:runId/cancel", async (req, res) => {
    const companyId = stringBody(req.body, "companyId");
    await assertCloudCompanyAccess(req, companyId);
    await assertEnabled();
    res.json(await service.cancelRun(req.params.connectionId, req.params.runId, companyId));
  });

  router.post("/cloud-upstreams/:connectionId/push-runs/:runId/activation", async (req, res) => {
    const companyId = stringBody(req.body, "companyId");
    await assertCloudCompanyAccess(req, companyId);
    await assertEnabled();
    res.json(await service.activateRunEntities({
      connectionId: req.params.connectionId,
      runId: req.params.runId,
      companyId,
      entityType: activationEntityTypeBody(req.body),
    }));
  });

  return router;
}

function stringQuery(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw badRequest(`${label} is required`);
  }
  return value;
}

function stringBody(body: unknown, key: string): string {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw badRequest(`${key} is required`);
  }
  const value = (body as Record<string, unknown>)[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw badRequest(`${key} is required`);
  }
  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function activationEntityTypeBody(body: unknown): "agents" | "routines" | "monitors" {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw badRequest("entityType is required");
  }
  const value = (body as Record<string, unknown>).entityType;
  if (value !== "agents" && value !== "routines" && value !== "monitors") {
    throw badRequest("entityType must be agents, routines, or monitors");
  }
  return value;
}
