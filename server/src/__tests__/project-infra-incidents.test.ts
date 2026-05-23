import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  companies,
  createDb,
  projectInfraIncidents,
  projects,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { projectInfraIncidentService } from "../services/project-infra-incidents.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres project infra incident tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("projectInfraIncidentService", () => {
  let stopDb: (() => Promise<void>) | null = null;
  let db!: ReturnType<typeof createDb>;

  beforeAll(async () => {
    const started = await startEmbeddedPostgresTestDatabase("project-infra-incidents");
    stopDb = started.stop;
    db = createDb(started.connectionString);
  });

  afterEach(async () => {
    await db.delete(projectInfraIncidents);
    await db.delete(projects);
    await db.delete(companies);
  });

  afterAll(async () => {
    await stopDb?.();
  });

  async function seedProject() {
    const companyId = randomUUID();
    const projectId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: "Acme",
      issuePrefix: `PIG${companyId.slice(0, 6).toUpperCase()}`,
    });
    await db.insert(projects).values({
      id: projectId,
      companyId,
      name: "Checkout",
    });
    return { companyId, projectId };
  }

  it("groups repeated inbound infra reports into one active incident and escalates by repeat threshold", async () => {
    const { projectId } = await seedProject();
    const svc = projectInfraIncidentService(db, { repeatThreshold: 2 });

    const first = await svc.recordOccurrence(projectId, {
      sourceKind: "inbound_email",
      sourceId: "message-1",
      status: "open",
      severity: "high",
      summary: "Checkout is down",
      details: "Gateway timeout",
      recommendedAction: "Triage before repair.",
    });
    const second = await svc.recordOccurrence(projectId, {
      sourceKind: "inbound_email",
      sourceId: "message-2",
      status: "open",
      severity: "high",
      summary: "Checkout still down",
      details: "Second user report",
      recommendedAction: "Triage before repair.",
    });

    expect(first?.disposition).toBe("created");
    expect(second?.disposition).toBe("reused");
    expect(second?.incident.id).toBe(first?.incident.id);
    expect(second?.incident.groupKey).toBe(`project:${projectId}:inbound_email`);
    expect(second?.incident.occurrenceCount).toBe(2);
    expect(second?.incident.status).toBe("investigating");
    expect(second?.incident.escalatedAt).not.toBeNull();
    expect(second?.incident.escalationReason).toContain("repeated 2 times");
    expect(await db.select().from(projectInfraIncidents)).toHaveLength(1);
  });

  it("can escalate urgent incidents immediately when policy allows it", async () => {
    const { projectId } = await seedProject();
    const svc = projectInfraIncidentService(db, {
      repeatThreshold: 10,
      escalateUrgentSeverity: true,
    });

    const result = await svc.recordOccurrence(projectId, {
      sourceKind: "manual",
      sourceId: "operator-report",
      status: "open",
      severity: "urgent",
      summary: "Full outage",
      details: "All health checks unavailable",
      recommendedAction: "Escalate to operator.",
    });

    expect(result?.disposition).toBe("created");
    expect(result?.escalated).toBe(true);
    expect(result?.incident.status).toBe("investigating");
    expect(result?.incident.escalationReason).toBe("urgent infrastructure incident severity");
  });
});
