import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { companies, createDb, paymentEntries, paymentRecords } from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { paymentService } from "../services/payments.ts";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres payment service tests: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("paymentService records", () => {
  let db!: ReturnType<typeof createDb>;
  let svc!: ReturnType<typeof paymentService>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  const companyId = randomUUID();

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-payments-service-");
    db = createDb(tempDb.connectionString);
    svc = paymentService(db);
    await db.insert(companies).values({
      id: companyId,
      name: "Payments Co",
      issuePrefix: "PAY",
      requireBoardApprovalForNewAgents: false,
    });
  }, 20_000);

  afterEach(async () => {
    await db.delete(paymentRecords);
    await db.delete(paymentEntries);
  });

  afterAll(async () => {
    await db.delete(companies);
    await tempDb?.cleanup();
  });

  async function recordIdByAmount(entryId: string, amountCents: number) {
    const detail = await svc.getEntry(companyId, entryId);
    const record = detail.records.find((candidate) => candidate.amountCents === amountCents);
    if (!record) throw new Error(`No record with amount ${amountCents}`);
    return record.id;
  }

  it("recomputes paid total and status when a record is deleted", async () => {
    const entry = await svc.createEntry(companyId, { title: "Hosting", expectedAmountCents: 10000, currency: "BRL" });
    await svc.recordPayment(companyId, entry.id, { amountCents: 4000, currency: "BRL" });
    const paid = await svc.recordPayment(companyId, entry.id, { amountCents: 6000, currency: "BRL" });
    expect(paid.entry.status).toBe("paid");
    expect(paid.entry.paidAmountCents).toBe(10000);

    const sixThousandId = await recordIdByAmount(entry.id, 6000);
    const afterDelete = await svc.deleteRecord(companyId, entry.id, sixThousandId);
    expect(afterDelete.entry.paidAmountCents).toBe(4000);
    expect(afterDelete.entry.status).toBe("partially_paid");
  });

  it("recomputes paid total and status when a record amount is edited up to full", async () => {
    const entry = await svc.createEntry(companyId, { title: "Domain", expectedAmountCents: 10000, currency: "BRL" });
    await svc.recordPayment(companyId, entry.id, { amountCents: 4000, currency: "BRL" });
    const fourThousandId = await recordIdByAmount(entry.id, 4000);

    const result = await svc.updateRecord(companyId, entry.id, fourThousandId, { amountCents: 10000 });
    expect(result.entry.paidAmountCents).toBe(10000);
    expect(result.entry.status).toBe("paid");
    expect(result.completed).toBe(true);
  });

  it("rejects editing a record currency that does not match the entry", async () => {
    const entry = await svc.createEntry(companyId, { title: "Mismatch", expectedAmountCents: 5000, currency: "BRL" });
    await svc.recordPayment(companyId, entry.id, { amountCents: 5000, currency: "BRL" });
    const recordId = await recordIdByAmount(entry.id, 5000);

    await expect(svc.updateRecord(companyId, entry.id, recordId, { currency: "USD" })).rejects.toThrow(/currency/i);
  });

  it("rejects deleting records from cancelled entries", async () => {
    const entry = await svc.createEntry(companyId, { title: "Cancelled partial", expectedAmountCents: 10000, currency: "BRL" });
    await svc.recordPayment(companyId, entry.id, { amountCents: 4000, currency: "BRL" });
    const recordId = await recordIdByAmount(entry.id, 4000);
    const cancelled = await svc.updateEntry(companyId, entry.id, { status: "cancelled" });
    expect(cancelled.status).toBe("cancelled");

    await expect(svc.deleteRecord(companyId, entry.id, recordId)).rejects.toThrow(/cancelled/i);

    const detail = await svc.getEntry(companyId, entry.id);
    expect(detail.paidAmountCents).toBe(4000);
    expect(detail.status).toBe("cancelled");
    expect(detail.records.map((record) => record.id)).toContain(recordId);
  });
});
