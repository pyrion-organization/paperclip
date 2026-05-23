import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  projectInfraHealthChecks,
  projects,
} from "@paperclipai/db";
import { issueService } from "./issues.js";
import { logger } from "../middleware/logger.js";
import { projectInfraIncidentService } from "./project-infra-incidents.js";

const DEFAULT_LIMIT = 20;
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_ERROR_LENGTH = 2_000;

type FetchLike = (input: string, init?: { signal?: AbortSignal }) => Promise<{ status: number }>;

export type InfraHealthCheckRunResult = {
  checked: number;
  healthy: number;
  degraded: number;
  unhealthy: number;
  incidentsCreated: number;
  incidentsReused: number;
  skipped: number;
  failed: number;
};

function truncateText(value: string, max = MAX_ERROR_LENGTH) {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function createEmptyResult(): InfraHealthCheckRunResult {
  return {
    checked: 0,
    healthy: 0,
    degraded: 0,
    unhealthy: 0,
    incidentsCreated: 0,
    incidentsReused: 0,
    skipped: 0,
    failed: 0,
  };
}

async function fetchWithTimeout(
  fetchImpl: FetchLike,
  url: string,
  timeoutMs: number,
): Promise<{ status: number; latencyMs: number }> {
  const controller = new AbortController();
  const startedAt = Date.now();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    return { status: response.status, latencyMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timeout);
  }
}

export function projectInfraHealthRunnerService(
  db: Db,
  deps: { fetch?: FetchLike } = {},
) {
  const issues = issueService(db);
  const infraIncidents = projectInfraIncidentService(db);
  const fetchImpl: FetchLike = deps.fetch ?? ((url, init) => fetch(url, init));

  async function ensureIncidentForHealthCheck(input: {
    check: typeof projectInfraHealthChecks.$inferSelect;
    status: "degraded" | "unhealthy";
    error: string;
    now: Date;
  }): Promise<"created" | "reused"> {
    const summary = `${input.check.name} reported ${input.status}`;
    const project = await db
      .select({ id: projects.id, companyId: projects.companyId, name: projects.name })
      .from(projects)
      .where(eq(projects.id, input.check.projectId))
      .then((rows) => rows[0] ?? null);
    if (!project) {
      throw new Error(`Project ${input.check.projectId} not found for infra health check ${input.check.id}`);
    }

    const result = await infraIncidents.recordOccurrence(input.check.projectId, {
      infraTargetId: input.check.infraTargetId,
      healthCheckId: input.check.id,
      sourceKind: "health_check",
      sourceId: input.check.id,
      status: "open",
      severity: input.status === "unhealthy" ? "high" : "medium",
      summary,
      details: input.error,
      recommendedAction: "Investigate health check failure. Provider repair and failover require separate approval.",
      lastOccurredAt: input.now,
      issueFactory: async () => {
        const issue = await issues.create(project.companyId, {
          title: `[Infra] ${summary}`.slice(0, 300),
          description: [
            "Created from a scheduled infrastructure health check.",
            "",
            `Project: ${project.name}`,
            `Health check: ${input.check.name}`,
            `Status: ${input.status}`,
            `Checked at: ${input.now.toISOString()}`,
            input.check.url ? `URL: ${input.check.url}` : null,
            `Error: ${input.error}`,
            "",
            "Provider repair and failover actions require explicit approval and are not executed automatically.",
          ].filter(Boolean).join("\n"),
          status: "backlog",
          priority: input.status === "unhealthy" ? "high" : "medium",
          projectId: project.id,
          originKind: "infra_health_check",
          originId: input.check.id,
          originFingerprint: `${input.check.id}:${input.status}`,
        });
        return issue.id;
      },
    });
    if (!result) {
      throw new Error(`Failed to record infra incident for health check ${input.check.id}`);
    }
    return result.disposition;
  }

  async function recordIncidentDisposition(input: {
    check: typeof projectInfraHealthChecks.$inferSelect;
    status: "degraded" | "unhealthy";
    error: string;
    now: Date;
    result: InfraHealthCheckRunResult;
  }): Promise<void> {
    try {
      const disposition = await ensureIncidentForHealthCheck(input);
      if (disposition === "created") input.result.incidentsCreated++;
      else input.result.incidentsReused++;
    } catch (incidentErr) {
      input.result.failed++;
      logger.error({ err: incidentErr, healthCheckId: input.check.id }, "failed to record infra health incident");
    }
  }

  return {
    async runDueHealthChecks(options: { now?: Date; limit?: number } = {}): Promise<InfraHealthCheckRunResult> {
      const now = options.now ?? new Date();
      const limit = Math.max(1, options.limit ?? DEFAULT_LIMIT);
      const result = createEmptyResult();
      const nowIso = now.toISOString();
      const dueChecks = await db
        .select()
        .from(projectInfraHealthChecks)
        .where(
          and(
            eq(projectInfraHealthChecks.enabled, true),
            eq(projectInfraHealthChecks.checkType, "http"),
            isNotNull(projectInfraHealthChecks.url),
            sql`(${projectInfraHealthChecks.lastCheckedAt} is null or ${projectInfraHealthChecks.lastCheckedAt} + (${projectInfraHealthChecks.intervalSeconds} * interval '1 second') <= ${nowIso}::timestamptz)`,
          ),
        )
        .orderBy(asc(projectInfraHealthChecks.lastCheckedAt), asc(projectInfraHealthChecks.createdAt))
        .limit(limit);

      for (const check of dueChecks) {
        if (!check.url) {
          result.skipped++;
          continue;
        }
        try {
          const timeoutMs = Math.max(1_000, (check.timeoutSeconds ?? DEFAULT_TIMEOUT_MS / 1000) * 1000);
          const response = await fetchWithTimeout(fetchImpl, check.url, timeoutMs);
          const expectedStatus = check.expectedStatus ?? 200;
          const status = response.status === expectedStatus ? "healthy" : "degraded";
          const error = status === "healthy" ? null : `Expected HTTP ${expectedStatus}, received HTTP ${response.status}`;

          await db
            .update(projectInfraHealthChecks)
            .set({
              status,
              lastCheckedAt: now,
              lastLatencyMs: response.latencyMs,
              lastError: error,
              lastSourceKind: "paperclip_scheduler",
              lastSourceId: "project-infra-health-runner",
              lastSourceDetail: "Scheduled Paperclip HTTP health check",
              lastSourceMetadata: { expectedStatus, receivedStatus: response.status },
              updatedAt: now,
            })
            .where(eq(projectInfraHealthChecks.id, check.id));

          result.checked++;
          if (status === "healthy") {
            result.healthy++;
          } else {
            result.degraded++;
            await recordIncidentDisposition({ check, status, error: error!, now, result });
          }
        } catch (err) {
          const error = truncateText(err instanceof Error ? err.message : String(err));
          await db
            .update(projectInfraHealthChecks)
            .set({
              status: "unhealthy",
              lastCheckedAt: now,
              lastLatencyMs: null,
              lastError: error,
              lastSourceKind: "paperclip_scheduler",
              lastSourceId: "project-infra-health-runner",
              lastSourceDetail: "Scheduled Paperclip HTTP health check failed before receiving a valid response",
              lastSourceMetadata: null,
              updatedAt: now,
            })
            .where(eq(projectInfraHealthChecks.id, check.id));

          result.checked++;
          result.unhealthy++;
          await recordIncidentDisposition({ check, status: "unhealthy", error, now, result });
        }
      }

      return result;
    },
  };
}
