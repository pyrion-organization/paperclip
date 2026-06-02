import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  projectInfraIncidents,
  projects,
} from "@paperclipai/db";

const ACTIVE_INFRA_INCIDENT_STATUSES = ["open", "investigating"] as const;
const DEFAULT_REPEAT_ESCALATION_THRESHOLD = 3;

type InfraIncidentRow = typeof projectInfraIncidents.$inferSelect;
type InfraIncidentInsert = typeof projectInfraIncidents.$inferInsert;
type InfraIncidentSeverity = "low" | "medium" | "high" | "urgent";

export type InfraIncidentEscalationPolicy = {
  repeatThreshold?: number;
  escalateHighSeverity?: boolean;
  escalateUrgentSeverity?: boolean;
};

export type RecordInfraIncidentInput = Omit<InfraIncidentInsert, "companyId" | "projectId"> & {
  issueFactory?: () => Promise<string | null>;
};

export type RecordInfraIncidentResult = {
  incident: InfraIncidentRow;
  disposition: "created" | "reused";
  escalated: boolean;
};

const severityRank: Record<InfraIncidentSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  urgent: 3,
};

function severityMax(a: string, b: string): string {
  const aRank = severityRank[(a as InfraIncidentSeverity) ?? "medium"] ?? 1;
  const bRank = severityRank[(b as InfraIncidentSeverity) ?? "medium"] ?? 1;
  return aRank >= bRank ? a : b;
}

function compactKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 200);
}

export function buildInfraIncidentGroupKey(
  projectId: string,
  input: Pick<InfraIncidentInsert, "groupKey" | "healthCheckId" | "infraTargetId" | "sourceKind" | "sourceId" | "summary">,
): string | null {
  if (input.groupKey?.trim()) return compactKey(input.groupKey);
  if (input.healthCheckId) return compactKey(`health_check:${input.healthCheckId}`);
  if (input.infraTargetId) return compactKey(`target:${input.infraTargetId}:${input.sourceKind}`);
  if (input.sourceKind === "inbound_email") return compactKey(`project:${projectId}:inbound_email`);
  if (input.sourceId) return compactKey(`${input.sourceKind}:${input.sourceId}`);
  return null;
}

function resolveEscalationPolicy(policy: InfraIncidentEscalationPolicy = {}) {
  const repeatThreshold = Math.max(
    2,
    policy.repeatThreshold ??
      (Number(process.env.PAPERCLIP_INFRA_INCIDENT_ESCALATION_REPEAT_THRESHOLD) ||
        DEFAULT_REPEAT_ESCALATION_THRESHOLD),
  );
  const escalateHighSeverity = policy.escalateHighSeverity ??
    process.env.PAPERCLIP_INFRA_INCIDENT_ESCALATE_HIGH_SEVERITY === "true";
  const escalateUrgentSeverity = policy.escalateUrgentSeverity ??
    process.env.PAPERCLIP_INFRA_INCIDENT_ESCALATE_URGENT_SEVERITY !== "false";
  return { repeatThreshold, escalateHighSeverity, escalateUrgentSeverity };
}

function escalationReasonFor(input: {
  severity: string;
  occurrenceCount: number;
  policy: ReturnType<typeof resolveEscalationPolicy>;
}): string | null {
  if (input.policy.escalateUrgentSeverity && input.severity === "urgent") {
    return "urgent infrastructure incident severity";
  }
  if (input.policy.escalateHighSeverity && input.severity === "high") {
    return "high infrastructure incident severity";
  }
  if (input.occurrenceCount >= input.policy.repeatThreshold) {
    return `infrastructure incident repeated ${input.occurrenceCount} times`;
  }
  return null;
}

function mergeIncidentMetadata(
  existing: Record<string, unknown> | null,
  input: Record<string, unknown> | null | undefined,
  relatedIssueId: string | null | undefined,
) {
  const merged = {
    ...(existing ?? {}),
    ...(input ?? {}),
  };
  if (relatedIssueId) {
    const existingIds = Array.isArray(merged.relatedIssueIds)
      ? merged.relatedIssueIds.filter((value): value is string => typeof value === "string")
      : [];
    merged.relatedIssueIds = Array.from(new Set([...existingIds, relatedIssueId]));
  }
  return Object.keys(merged).length > 0 ? merged : null;
}

export function projectInfraIncidentService(
  db: Db,
  policy?: InfraIncidentEscalationPolicy,
) {
  const escalationPolicy = resolveEscalationPolicy(policy);

  return {
    async recordOccurrence(
      projectId: string,
      input: RecordInfraIncidentInput,
    ): Promise<RecordInfraIncidentResult | null> {
      const project = await db
        .select({ id: projects.id, companyId: projects.companyId })
        .from(projects)
        .where(eq(projects.id, projectId))
        .then((rows) => rows[0] ?? null);
      if (!project) return null;

      const now = new Date();
      const groupKey = buildInfraIncidentGroupKey(projectId, input);
      const existing = groupKey
        ? await db
          .select()
          .from(projectInfraIncidents)
          .where(
            and(
              eq(projectInfraIncidents.companyId, project.companyId),
              eq(projectInfraIncidents.projectId, projectId),
              eq(projectInfraIncidents.groupKey, groupKey),
              inArray(projectInfraIncidents.status, [...ACTIVE_INFRA_INCIDENT_STATUSES]),
            ),
          )
          .then((rows) => rows[0] ?? null)
        : null;

      if (existing) {
        const generatedIssueId = !existing.issueId && !input.issueId ? await input.issueFactory?.() : null;
        const fallbackIssueId = existing.issueId ?? input.issueId ?? generatedIssueId ?? null;
        const occurrenceCount = existing.occurrenceCount + 1;
        const severity = severityMax(existing.severity, input.severity ?? "high");
        const escalationReason = existing.escalationReason ??
          escalationReasonFor({ severity, occurrenceCount, policy: escalationPolicy });
        const escalated = !existing.escalatedAt && escalationReason !== null;
        const recommendedAction = input.recommendedAction ?? existing.recommendedAction;
        const [updated] = await db
          .update(projectInfraIncidents)
          .set({
            infraTargetId: existing.infraTargetId ?? input.infraTargetId ?? null,
            healthCheckId: existing.healthCheckId ?? input.healthCheckId ?? null,
            issueId: fallbackIssueId,
            sourceKind: input.sourceKind,
            sourceId: input.sourceId ?? existing.sourceId,
            status: escalated && existing.status === "open" ? "investigating" : existing.status,
            severity,
            summary: input.summary || existing.summary,
            details: input.details ?? existing.details,
            recommendedAction: escalated && escalationReason
              ? `Escalated: ${escalationReason}. ${recommendedAction ?? ""}`.trim()
              : recommendedAction,
            occurrenceCount: sql`${projectInfraIncidents.occurrenceCount} + 1`,
            lastOccurredAt: now,
            escalatedAt: existing.escalatedAt ?? (escalated ? now : null),
            escalationReason: existing.escalationReason ?? escalationReason,
            repairApprovalId: existing.repairApprovalId ?? input.repairApprovalId ?? null,
            metadata: mergeIncidentMetadata(existing.metadata, input.metadata, input.issueId),
            updatedAt: now,
          })
          .where(eq(projectInfraIncidents.id, existing.id))
          .returning();
        if (!updated) return null;
        if (!updated.escalationReason) {
          const postIncrementEscalationReason = escalationReasonFor({
            severity: updated.severity,
            occurrenceCount: updated.occurrenceCount,
            policy: escalationPolicy,
          });
          if (postIncrementEscalationReason) {
            const [postEscalation] = await db
              .update(projectInfraIncidents)
              .set({
                status: updated.status === "open" ? "investigating" : updated.status,
                recommendedAction: `Escalated: ${postIncrementEscalationReason}. ${recommendedAction ?? ""}`.trim(),
                escalatedAt: now,
                escalationReason: postIncrementEscalationReason,
                updatedAt: now,
              })
              .where(and(eq(projectInfraIncidents.id, updated.id), isNull(projectInfraIncidents.escalationReason)))
              .returning();
            if (postEscalation) {
              return { incident: postEscalation, disposition: "reused", escalated: true };
            }
          }
        }
        return { incident: updated, disposition: "reused", escalated };
      }

      const { issueFactory: _issueFactory, ...incidentInput } = input;
      const generatedIssueId = input.issueId ? null : await input.issueFactory?.();
      const issueId = input.issueId ?? generatedIssueId ?? null;
      const severity = input.severity ?? "high";
      const status = input.status ?? "open";
      const occurrenceCount = input.occurrenceCount ?? 1;
      const escalationReason = input.escalationReason ??
        escalationReasonFor({ severity, occurrenceCount, policy: escalationPolicy });
      const escalatedAt = input.escalatedAt ?? (escalationReason ? now : null);
      const [created] = await db
        .insert(projectInfraIncidents)
        .values({
          ...incidentInput,
          companyId: project.companyId,
          projectId,
          issueId,
          groupKey,
          status: escalationReason && status === "open" ? "investigating" : status,
          occurrenceCount,
          lastOccurredAt: input.lastOccurredAt ?? now,
          escalatedAt,
          escalationReason,
          updatedAt: now,
        })
        .returning();
      return created ? { incident: created, disposition: "created", escalated: escalationReason !== null } : null;
    },
  };
}
