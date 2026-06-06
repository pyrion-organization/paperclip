import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  activityLog,
  agents,
  companies,
  companySkills,
  createDb,
  documents,
  documentRevisions,
  emailNotifications,
  heartbeatRunEvents,
  heartbeatRuns,
  issueComments,
  issueDocuments,
  issueExecutionDecisions,
  issueReadStates,
  issueThreadInteractions,
  issues,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { agentService } from "../services/agents.ts";
import { companyService } from "../services/companies.ts";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping cleanup removal service tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("cleanup removal services", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-cleanup-removal-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.delete(heartbeatRunEvents);
    await db.delete(activityLog);
    await db.delete(emailNotifications);
    await db.delete(issueReadStates);
    await db.delete(issueThreadInteractions);
    await db.delete(issueComments);
    await db.delete(issueExecutionDecisions);
    await db.delete(documentRevisions);
    await db.delete(documents);
    await db.delete(companySkills);
    await db.delete(heartbeatRuns);
    await db.delete(issues);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seedFixture() {
    const companyId = randomUUID();
    const agentId = randomUUID();
    const issueId = randomUUID();
    const runId = randomUUID();
    const issuePrefix = `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;

    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix,
      requireBoardApprovalForNewAgents: false,
    });

    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "CodexCoder",
      role: "engineer",
      status: "active",
      adapterType: "codex_local",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
    });

    await db.insert(issues).values({
      id: issueId,
      companyId,
      title: "Regression fixture",
      status: "todo",
      priority: "medium",
      assigneeAgentId: agentId,
      createdByUserId: "user-1",
    });

    await db.insert(heartbeatRuns).values({
      id: runId,
      companyId,
      agentId,
      invocationSource: "assignment",
      status: "completed",
      contextSnapshot: { issueId },
    });

    return { agentId, companyId, issueId, runId };
  }

  it("removes agent-owned issue comments and run-linked activity before deleting the agent", async () => {
    const { agentId, companyId, issueId, runId } = await seedFixture();

    await db.insert(issueComments).values({
      id: randomUUID(),
      companyId,
      issueId,
      authorAgentId: agentId,
      body: "Agent-authored comment",
    });

    await db.insert(activityLog).values({
      id: randomUUID(),
      companyId,
      actorType: "agent",
      actorId: agentId,
      action: "heartbeat.completed",
      entityType: "issue",
      entityId: issueId,
      runId,
      details: {},
    });

    await db.insert(emailNotifications).values({
      id: randomUUID(),
      companyId,
      kind: "issue_completion",
      status: "pending",
      issueId,
      recipientUserId: "user-1",
      recipientEmail: "user@example.com",
      subject: "Issue done",
      payload: {
        issueTitle: "Regression fixture",
        issueIdentifier: null,
        completedByName: "CodexCoder",
        completedByKind: "agent",
        agentComment: null,
        issueDescription: null,
        completedAt: new Date().toISOString(),
      },
    });

    await db.insert(issueExecutionDecisions).values({
      id: randomUUID(),
      companyId,
      issueId,
      stageId: randomUUID(),
      stageType: "review",
      actorAgentId: agentId,
      outcome: "approved",
      body: "Looks good",
      createdByRunId: runId,
    });

    const removed = await agentService(db).remove(agentId);

    expect(removed?.id).toBe(agentId);
    await expect(db.select().from(agents).where(eq(agents.id, agentId))).resolves.toHaveLength(0);
    await expect(db.select().from(heartbeatRuns).where(eq(heartbeatRuns.id, runId))).resolves.toHaveLength(0);
    await expect(db.select().from(issueComments).where(eq(issueComments.issueId, issueId))).resolves.toHaveLength(0);
    await expect(db.select().from(activityLog).where(eq(activityLog.companyId, companyId))).resolves.toHaveLength(0);
  });

  it("preserves unrelated document locks when deleting an agent", async () => {
    const { agentId, companyId } = await seedFixture();
    const otherAgentId = randomUUID();
    const lockedByOtherDocumentId = randomUUID();
    const lockedByDeletedDocumentId = randomUUID();
    const lockedAt = new Date("2026-06-03T17:30:00.000Z");

    await db.insert(agents).values({
      id: otherAgentId,
      companyId,
      name: "Reviewer",
      role: "reviewer",
      status: "active",
      adapterType: "codex_local",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
    });

    await db.insert(documents).values([
      {
        id: lockedByOtherDocumentId,
        companyId,
        title: "Created by deleted agent",
        latestBody: "body",
        createdByAgentId: agentId,
        updatedByAgentId: agentId,
        lockedByAgentId: otherAgentId,
        lockedAt,
      },
      {
        id: lockedByDeletedDocumentId,
        companyId,
        title: "Locked by deleted agent",
        latestBody: "body",
        createdByAgentId: otherAgentId,
        updatedByAgentId: otherAgentId,
        lockedByAgentId: agentId,
        lockedAt,
      },
    ]);

    const removed = await agentService(db).remove(agentId);

    expect(removed?.id).toBe(agentId);
    const rows = await db.select().from(documents);
    const lockedByOther = rows.find((row) => row.id === lockedByOtherDocumentId);
    const lockedByDeleted = rows.find((row) => row.id === lockedByDeletedDocumentId);

    expect(lockedByOther).toMatchObject({
      createdByAgentId: null,
      updatedByAgentId: null,
      lockedByAgentId: otherAgentId,
    });
    expect(lockedByOther?.lockedAt?.toISOString()).toBe(lockedAt.toISOString());
    expect(lockedByDeleted).toMatchObject({
      createdByAgentId: otherAgentId,
      updatedByAgentId: otherAgentId,
      lockedByAgentId: null,
      lockedAt: null,
    });
  });

  it("preserves unrelated issue thread interaction agent attribution when deleting an agent", async () => {
    const { agentId, companyId, issueId } = await seedFixture();
    const otherAgentId = randomUUID();
    const createdByDeletedId = randomUUID();
    const resolvedByDeletedId = randomUUID();

    await db.insert(agents).values({
      id: otherAgentId,
      companyId,
      name: "Reviewer",
      role: "reviewer",
      status: "active",
      adapterType: "codex_local",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
    });

    await db.insert(issueThreadInteractions).values([
      {
        id: createdByDeletedId,
        companyId,
        issueId,
        kind: "follow_up",
        status: "resolved",
        createdByAgentId: agentId,
        resolvedByAgentId: otherAgentId,
        payload: {},
      },
      {
        id: resolvedByDeletedId,
        companyId,
        issueId,
        kind: "follow_up",
        status: "resolved",
        createdByAgentId: otherAgentId,
        resolvedByAgentId: agentId,
        payload: {},
      },
    ]);

    const removed = await agentService(db).remove(agentId);

    expect(removed?.id).toBe(agentId);
    const rows = await db.select().from(issueThreadInteractions);
    const createdByDeleted = rows.find((row) => row.id === createdByDeletedId);
    const resolvedByDeleted = rows.find((row) => row.id === resolvedByDeletedId);

    expect(createdByDeleted).toMatchObject({
      createdByAgentId: null,
      resolvedByAgentId: otherAgentId,
    });
    expect(resolvedByDeleted).toMatchObject({
      createdByAgentId: otherAgentId,
      resolvedByAgentId: null,
    });
  });

  it("removes issue read states and activity rows before deleting the company", async () => {
    const { companyId, issueId, runId } = await seedFixture();
    const documentId = randomUUID();
    const revisionId = randomUUID();

    await db.insert(issueReadStates).values({
      id: randomUUID(),
      companyId,
      issueId,
      userId: "user-1",
    });

    await db.insert(companySkills).values({
      id: randomUUID(),
      companyId,
      key: "paperclipai/paperclip/paperclip",
      slug: "paperclip",
      name: "Paperclip",
      markdown: "# Paperclip",
    });

    await db.insert(activityLog).values({
      id: randomUUID(),
      companyId,
      actorType: "system",
      actorId: "system",
      action: "run.created",
      entityType: "run",
      entityId: runId,
      runId,
      details: {},
    });

    await db.insert(documents).values({
      id: documentId,
      companyId,
      title: "Run summary",
      latestBody: "body",
      latestRevisionId: revisionId,
      latestRevisionNumber: 1,
      createdByAgentId: null,
      createdByUserId: "user-1",
      updatedByAgentId: null,
      updatedByUserId: "user-1",
    });

    await db.insert(issueDocuments).values({
      id: randomUUID(),
      companyId,
      issueId,
      documentId,
      key: "summary",
    });

    await db.insert(documentRevisions).values({
      id: revisionId,
      companyId,
      documentId,
      revisionNumber: 1,
      title: "Run summary",
      format: "markdown",
      body: "body",
      createdByAgentId: null,
      createdByUserId: "user-1",
      createdByRunId: runId,
    });

    const removed = await companyService(db).remove(companyId);

    expect(removed?.id).toBe(companyId);
    await expect(db.select().from(companies).where(eq(companies.id, companyId))).resolves.toHaveLength(0);
    await expect(db.select().from(issues).where(eq(issues.id, issueId))).resolves.toHaveLength(0);
    await expect(db.select().from(documents).where(eq(documents.id, documentId))).resolves.toHaveLength(0);
    await expect(db.select().from(documentRevisions).where(eq(documentRevisions.id, revisionId))).resolves.toHaveLength(0);
    await expect(db.select().from(issueReadStates).where(eq(issueReadStates.companyId, companyId))).resolves.toHaveLength(0);
    await expect(db.select().from(emailNotifications).where(eq(emailNotifications.companyId, companyId))).resolves.toHaveLength(0);
    await expect(db.select().from(activityLog).where(eq(activityLog.companyId, companyId))).resolves.toHaveLength(0);
  });

  it("removes heartbeat events by run id before deleting company-owned runs", async () => {
    const { agentId, companyId, runId } = await seedFixture();
    const otherCompanyId = randomUUID();

    await db.insert(companies).values({
      id: otherCompanyId,
      name: "Other Company",
      issuePrefix: `O${otherCompanyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });

    await db.insert(heartbeatRunEvents).values({
      companyId: otherCompanyId,
      runId,
      agentId,
      seq: 1,
      eventType: "output",
      message: "event with mismatched company scope",
    });

    const removed = await companyService(db).remove(companyId);

    expect(removed?.id).toBe(companyId);
    await expect(db.select().from(heartbeatRuns).where(eq(heartbeatRuns.id, runId))).resolves.toHaveLength(0);
    await expect(db.select().from(heartbeatRunEvents).where(eq(heartbeatRunEvents.runId, runId))).resolves.toHaveLength(0);
    await expect(db.select().from(companies).where(eq(companies.id, otherCompanyId))).resolves.toHaveLength(1);
  });
});
