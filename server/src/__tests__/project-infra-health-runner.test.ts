import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  activityLog,
  companies,
  createDb,
  issues,
  projectInfraHealthChecks,
  projectInfraIncidents,
  projects,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { projectInfraHealthRunnerService } from "../services/project-infra-health-runner.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres project infra health runner tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("projectInfraHealthRunnerService", () => {
  let stopDb: (() => Promise<void>) | null = null;
  let db!: ReturnType<typeof createDb>;

  beforeAll(async () => {
    const started = await startEmbeddedPostgresTestDatabase("project-infra-health-runner");
    stopDb = started.stop;
    db = createDb(started.connectionString);
  });

  afterEach(async () => {
    await db.delete(projectInfraIncidents);
    await db.delete(projectInfraHealthChecks);
    await db.delete(activityLog);
    await db.delete(issues);
    await db.delete(projects);
    await db.delete(companies);
  });

  afterAll(async () => {
    await stopDb?.();
  });

  async function seedHealthCheck(input: {
    expectedStatus?: number;
    intervalSeconds?: number;
    lastCheckedAt?: Date | null;
  } = {}) {
    const companyId = randomUUID();
    const projectId = randomUUID();
    const healthCheckId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Acme",
      issuePrefix: `PHR${companyId.slice(0, 6).toUpperCase()}`,
    });
    await db.insert(projects).values({
      id: projectId,
      companyId,
      name: "Checkout",
    });
    await db.insert(projectInfraHealthChecks).values({
      id: healthCheckId,
      companyId,
      projectId,
      name: "Checkout health",
      checkType: "http",
      url: "https://example.test/health",
      expectedStatus: input.expectedStatus ?? 200,
      intervalSeconds: input.intervalSeconds ?? 30,
      timeoutSeconds: 1,
      lastCheckedAt: input.lastCheckedAt ?? null,
      enabled: true,
    });

    return { companyId, projectId, healthCheckId };
  }

  it("records a healthy HTTP check without creating an incident", async () => {
    const { healthCheckId } = await seedHealthCheck();
    const svc = projectInfraHealthRunnerService(db, {
      fetch: async () => ({ status: 200 }),
    });

    const result = await svc.runDueHealthChecks({ now: new Date("2026-05-23T10:00:00.000Z") });

    expect(result).toMatchObject({
      checked: 1,
      healthy: 1,
      degraded: 0,
      unhealthy: 0,
      incidentsCreated: 0,
      incidentsReused: 0,
      failed: 0,
    });
    const [check] = await db
      .select()
      .from(projectInfraHealthChecks)
      .where(eq(projectInfraHealthChecks.id, healthCheckId));
    expect(check.status).toBe("healthy");
    expect(check.lastCheckedAt?.toISOString()).toBe("2026-05-23T10:00:00.000Z");
    expect(check.lastError).toBeNull();
    expect(check.lastLatencyMs).not.toBeNull();
    const incidentRows = await db.select().from(projectInfraIncidents);
    expect(incidentRows).toHaveLength(0);
  });

  it("creates and reuses an open incident for degraded checks", async () => {
    const { healthCheckId } = await seedHealthCheck();
    const svc = projectInfraHealthRunnerService(db, {
      fetch: async () => ({ status: 500 }),
    });

    const first = await svc.runDueHealthChecks({ now: new Date("2026-05-23T10:00:00.000Z") });

    expect(first).toMatchObject({
      checked: 1,
      degraded: 1,
      incidentsCreated: 1,
      incidentsReused: 0,
      failed: 0,
    });
    const incidentRows = await db.select().from(projectInfraIncidents);
    expect(incidentRows).toHaveLength(1);
    expect(incidentRows[0]?.sourceKind).toBe("health_check");
    expect(incidentRows[0]?.sourceId).toBe(healthCheckId);
    expect(incidentRows[0]?.status).toBe("open");
    expect(incidentRows[0]?.details).toContain("Expected HTTP 200, received HTTP 500");
    expect(await db.select().from(issues)).toHaveLength(1);

    const second = await svc.runDueHealthChecks({ now: new Date("2026-05-23T10:01:00.000Z") });

    expect(second).toMatchObject({
      checked: 1,
      degraded: 1,
      incidentsCreated: 0,
      incidentsReused: 1,
      failed: 0,
    });
    expect(await db.select().from(projectInfraIncidents)).toHaveLength(1);
    expect(await db.select().from(issues)).toHaveLength(1);
  });

  it("skips checks that are not due yet", async () => {
    await seedHealthCheck({
      intervalSeconds: 300,
      lastCheckedAt: new Date("2026-05-23T10:00:00.000Z"),
    });
    const svc = projectInfraHealthRunnerService(db, {
      fetch: async () => {
        throw new Error("fetch should not be called");
      },
    });

    const result = await svc.runDueHealthChecks({ now: new Date("2026-05-23T10:01:00.000Z") });

    expect(result).toMatchObject({
      checked: 0,
      healthy: 0,
      degraded: 0,
      unhealthy: 0,
      incidentsCreated: 0,
      incidentsReused: 0,
      failed: 0,
    });
  });
});
