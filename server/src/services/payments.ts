import { and, asc, desc, eq, gte, ilike, inArray, lt, lte, ne, or, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { calendarItems, paymentEntries, paymentProfiles, paymentRecords } from "@paperclipai/db";
import type {
  CreatePaymentEntry,
  PaymentEntryFilter,
  PaymentEntryStatus,
  PaymentProfileInput,
  RecordPayment,
  UpdatePaymentEntry,
  UpdatePaymentProfile,
  UpdatePaymentRecord,
} from "@paperclipai/shared";
import { badRequest, notFound, unprocessable } from "../errors.js";

type CalendarPaymentItem = Pick<
  typeof calendarItems.$inferSelect,
  "id" | "companyId" | "category" | "title" | "providerName" | "nextDueDate" | "amountCents" | "currency" | "paymentProfileId" | "status"
>;

function dateOnly(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.toISOString();
}

function rowToProfile(row: typeof paymentProfiles.$inferSelect) {
  return {
    ...row,
    createdAt: iso(row.createdAt)!,
    updatedAt: iso(row.updatedAt)!,
  };
}

function rowToEntry(row: typeof paymentEntries.$inferSelect, profile?: typeof paymentProfiles.$inferSelect | null) {
  return {
    ...row,
    dueDate: dateOnly(row.dueDate),
    createdAt: iso(row.createdAt)!,
    updatedAt: iso(row.updatedAt)!,
    profile: profile ? rowToProfile(profile) : null,
  };
}

function rowToRecord(row: typeof paymentRecords.$inferSelect, profile?: typeof paymentProfiles.$inferSelect | null) {
  return {
    ...row,
    paidAt: iso(row.paidAt)!,
    createdAt: iso(row.createdAt)!,
    profile: profile ? rowToProfile(profile) : null,
  };
}

function statusFor(entry: Pick<typeof paymentEntries.$inferSelect, "status" | "expectedAmountCents">, paidAmountCents: number): PaymentEntryStatus {
  if (entry.status === "cancelled") return "cancelled";
  if (entry.expectedAmountCents == null) return paidAmountCents > 0 ? "paid" : "open";
  if (paidAmountCents <= 0) return "open";
  if (paidAmountCents < entry.expectedAmountCents) return "partially_paid";
  return "paid";
}

function sortedMoneyTotals(totals: Map<string, number>) {
  return [...totals.entries()]
    .filter(([, amountCents]) => amountCents > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, amountCents]) => ({ currency, amountCents }));
}

async function paidAmountForEntry(db: Db, companyId: string, entryId: string): Promise<number> {
  const [{ total }] = await db
    .select({ total: sql<number>`coalesce(sum(${paymentRecords.amountCents}), 0)::int` })
    .from(paymentRecords)
    .where(and(eq(paymentRecords.companyId, companyId), eq(paymentRecords.paymentEntryId, entryId)));
  return Number(total ?? 0);
}

async function assertProfile(db: Db, companyId: string, profileId: string) {
  const profile = await db
    .select()
    .from(paymentProfiles)
    .where(and(eq(paymentProfiles.companyId, companyId), eq(paymentProfiles.id, profileId)))
    .then((rows) => rows[0] ?? null);
  if (!profile) throw notFound("Payment profile not found");
  return profile;
}

async function assertCalendarItem(db: Db, companyId: string, itemId: string) {
  const item = await db
    .select()
    .from(calendarItems)
    .where(and(eq(calendarItems.companyId, companyId), eq(calendarItems.id, itemId)))
    .then((rows) => rows[0] ?? null);
  if (!item) throw notFound("Calendar item not found");
  return item;
}

export function paymentService(db: Db) {
  async function hydrateEntries(rows: Array<typeof paymentEntries.$inferSelect>) {
    const profileIds = [...new Set(rows.map((row) => row.paymentProfileId).filter((id): id is string => Boolean(id)))];
    const profiles = profileIds.length > 0
      ? await db.select().from(paymentProfiles).where(inArray(paymentProfiles.id, profileIds))
      : [];
    const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
    return rows.map((row) => rowToEntry(row, row.paymentProfileId ? profileById.get(row.paymentProfileId) ?? null : null));
  }

  async function reconcileEntry(row: typeof paymentEntries.$inferSelect) {
    const paidAmountCents = await paidAmountForEntry(db, row.companyId, row.id);
    if (row.status === "cancelled" || (paidAmountCents <= 0 && row.paidAmountCents <= 0)) {
      return (await hydrateEntries([row]))[0]!;
    }
    const nextStatus = statusFor(row, paidAmountCents);
    const [reconciled] = await db
      .update(paymentEntries)
      .set({ paidAmountCents, status: nextStatus, updatedAt: new Date() })
      .where(and(eq(paymentEntries.companyId, row.companyId), eq(paymentEntries.id, row.id)))
      .returning();
    return (await hydrateEntries([reconciled]))[0]!;
  }

  return {
    listProfiles: async (companyId: string) => {
      const rows = await db
        .select()
        .from(paymentProfiles)
        .where(eq(paymentProfiles.companyId, companyId))
        .orderBy(desc(paymentProfiles.active), asc(paymentProfiles.accountLabel));
      return rows.map(rowToProfile);
    },

    createProfile: async (companyId: string, input: PaymentProfileInput) => {
      const [row] = await db
        .insert(paymentProfiles)
        .values({ ...input, companyId })
        .returning();
      return rowToProfile(row);
    },

    updateProfile: async (companyId: string, profileId: string, input: UpdatePaymentProfile) => {
      await assertProfile(db, companyId, profileId);
      const [row] = await db
        .update(paymentProfiles)
        .set({ ...input, updatedAt: new Date() })
        .where(and(eq(paymentProfiles.companyId, companyId), eq(paymentProfiles.id, profileId)))
        .returning();
      return rowToProfile(row);
    },

    listEntries: async (companyId: string, filters: PaymentEntryFilter) => {
      const conditions = [eq(paymentEntries.companyId, companyId)];
      if (filters.status?.length === 1) conditions.push(eq(paymentEntries.status, filters.status[0]!));
      else if (filters.status && filters.status.length > 1) conditions.push(inArray(paymentEntries.status, filters.status));
      if (filters.calendarItemId) conditions.push(eq(paymentEntries.calendarItemId, filters.calendarItemId));
      if (filters.profileId) conditions.push(eq(paymentEntries.paymentProfileId, filters.profileId));
      if (filters.dueFrom) conditions.push(gte(paymentEntries.dueDate, filters.dueFrom));
      if (filters.dueTo) conditions.push(lte(paymentEntries.dueDate, filters.dueTo));
      if (filters.q) {
        const q = `%${filters.q}%`;
        conditions.push(or(
          ilike(paymentEntries.title, q),
          ilike(paymentEntries.providerName, q),
          ilike(paymentEntries.notes, q),
        )!);
      }
      const where = and(...conditions);
      const dir = filters.dir === "desc" ? desc : asc;
      const orderBy = (() => {
        switch (filters.sort) {
          case "amount": return [dir(paymentEntries.expectedAmountCents), asc(paymentEntries.title)];
          case "status": return [dir(paymentEntries.status), asc(paymentEntries.title)];
          case "title": return [dir(paymentEntries.title)];
          case "dueDate": return [dir(paymentEntries.dueDate), asc(paymentEntries.title)];
          default: return [asc(paymentEntries.dueDate), asc(paymentEntries.title)];
        }
      })();
      const [countRow] = await db.select({ count: sql<number>`count(*)::int` }).from(paymentEntries).where(where);
      const rows = await db
        .select()
        .from(paymentEntries)
        .where(where)
        .orderBy(...orderBy)
        .limit(filters.limit)
        .offset(filters.offset);
      return { entries: await hydrateEntries(rows), total: countRow?.count ?? 0 };
    },

    getEntry: async (companyId: string, entryId: string) => {
      const entry = await db
        .select()
        .from(paymentEntries)
        .where(and(eq(paymentEntries.companyId, companyId), eq(paymentEntries.id, entryId)))
        .then((rows) => rows[0] ?? null);
      if (!entry) throw notFound("Payment entry not found");
      const records = await db
        .select()
        .from(paymentRecords)
        .where(and(eq(paymentRecords.companyId, companyId), eq(paymentRecords.paymentEntryId, entryId)))
        .orderBy(desc(paymentRecords.paidAt), desc(paymentRecords.createdAt));
      const profileIds = [...new Set([
        entry.paymentProfileId,
        ...records.map((record) => record.paymentProfileId),
      ].filter((id): id is string => Boolean(id)))];
      const profiles = profileIds.length > 0
        ? await db.select().from(paymentProfiles).where(inArray(paymentProfiles.id, profileIds))
        : [];
      const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
      return {
        ...rowToEntry(entry, entry.paymentProfileId ? profileById.get(entry.paymentProfileId) ?? null : null),
        records: records.map((record) => rowToRecord(record, record.paymentProfileId ? profileById.get(record.paymentProfileId) ?? null : null)),
      };
    },

    createEntry: async (companyId: string, input: CreatePaymentEntry) => {
      if (input.paymentProfileId) await assertProfile(db, companyId, input.paymentProfileId);
      if (input.calendarItemId) await assertCalendarItem(db, companyId, input.calendarItemId);
      const [row] = await db
        .insert(paymentEntries)
        .values({ ...input, companyId })
        .returning();
      return (await hydrateEntries([row]))[0]!;
    },

    updateEntry: async (companyId: string, entryId: string, input: UpdatePaymentEntry) => {
      const existing = await db
        .select()
        .from(paymentEntries)
        .where(and(eq(paymentEntries.companyId, companyId), eq(paymentEntries.id, entryId)))
        .then((rows) => rows[0] ?? null);
      if (!existing) throw notFound("Payment entry not found");
      if (existing.status === "paid" && input.status != null && input.status !== "paid") {
        throw unprocessable("Paid entries cannot be reopened");
      }
      if (existing.status !== "paid" && input.status === "paid") {
        throw unprocessable("Use payment records to mark entries paid");
      }
      if (
        existing.status === "paid"
        && input.expectedAmountCents !== undefined
        && statusFor({ ...existing, expectedAmountCents: input.expectedAmountCents }, existing.paidAmountCents) !== "paid"
      ) {
        throw unprocessable("Paid entries cannot be reopened by amount changes");
      }
      if (input.paymentProfileId) await assertProfile(db, companyId, input.paymentProfileId);
      if (input.calendarItemId) await assertCalendarItem(db, companyId, input.calendarItemId);
      const [row] = await db
        .update(paymentEntries)
        .set({ ...input, updatedAt: new Date() })
        .where(and(eq(paymentEntries.companyId, companyId), eq(paymentEntries.id, entryId)))
        .returning();
      return reconcileEntry(row);
    },

    recordPayment: async (companyId: string, entryId: string, input: RecordPayment) => {
      const result = await db.transaction(async (tx) => {
        const entry = await tx
          .select()
          .from(paymentEntries)
          .where(and(eq(paymentEntries.companyId, companyId), eq(paymentEntries.id, entryId)))
          .for("update")
          .then((rows) => rows[0] ?? null);
        if (!entry) throw notFound("Payment entry not found");
        if (entry.status === "cancelled") throw unprocessable("Cancelled entries cannot receive payments");
        if (entry.status === "paid") throw unprocessable("Payment entry is already paid");
        const recordCurrency = input.currency ?? entry.currency;
        if (recordCurrency !== entry.currency) {
          throw unprocessable("Payment record currency must match the payment entry currency");
        }

        const profileId = Object.prototype.hasOwnProperty.call(input, "paymentProfileId")
          ? input.paymentProfileId ?? null
          : entry.paymentProfileId;
        if (profileId) {
          const profile = await tx
            .select()
            .from(paymentProfiles)
            .where(and(eq(paymentProfiles.companyId, companyId), eq(paymentProfiles.id, profileId)))
            .then((rows) => rows[0] ?? null);
          if (!profile) throw notFound("Payment profile not found");
        }

        const [{ total: currentPaidTotal }] = await tx
          .select({ total: sql<number>`coalesce(sum(${paymentRecords.amountCents}), 0)::int` })
          .from(paymentRecords)
          .where(and(eq(paymentRecords.companyId, companyId), eq(paymentRecords.paymentEntryId, entryId)));
        const projectedPaidAmountCents = Number(currentPaidTotal ?? 0) + input.amountCents;
        const nextStatus = statusFor(entry, projectedPaidAmountCents);
        if (nextStatus === "paid" && entry.status !== "paid" && entry.calendarItemId && !input.approvalConfirmed) {
          const calendarItem = await tx
            .select({ riskLevel: calendarItems.riskLevel })
            .from(calendarItems)
            .where(and(eq(calendarItems.companyId, companyId), eq(calendarItems.id, entry.calendarItemId)))
            .then((rows) => rows[0] ?? null);
          if (calendarItem && (calendarItem.riskLevel === "high" || calendarItem.riskLevel === "critical")) {
            throw unprocessable("Completing high-risk or critical items requires approval confirmation");
          }
        }

        const { approvalConfirmed: _approvalConfirmed, ...recordInput } = input;
        await tx.insert(paymentRecords).values({
          ...recordInput,
          companyId,
          paymentEntryId: entryId,
          currency: recordCurrency,
          paymentProfileId: profileId,
          paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
        });

        const [updated] = await tx
          .update(paymentEntries)
          .set({ paidAmountCents: projectedPaidAmountCents, status: nextStatus, updatedAt: new Date() })
          .where(and(eq(paymentEntries.companyId, companyId), eq(paymentEntries.id, entryId)))
          .returning();
        return {
          updated,
          completed: nextStatus === "paid" && entry.status !== "paid",
        };
      });
      return {
        entry: (await hydrateEntries([result.updated]))[0]!,
        completed: result.completed,
      };
    },

    updateRecord: async (companyId: string, entryId: string, recordId: string, input: UpdatePaymentRecord) => {
      const result = await db.transaction(async (tx) => {
        const entry = await tx
          .select()
          .from(paymentEntries)
          .where(and(eq(paymentEntries.companyId, companyId), eq(paymentEntries.id, entryId)))
          .for("update")
          .then((rows) => rows[0] ?? null);
        if (!entry) throw notFound("Payment entry not found");
        if (entry.status === "cancelled") throw unprocessable("Cancelled entries cannot be edited");
        const record = await tx
          .select()
          .from(paymentRecords)
          .where(and(
            eq(paymentRecords.companyId, companyId),
            eq(paymentRecords.paymentEntryId, entryId),
            eq(paymentRecords.id, recordId),
          ))
          .then((rows) => rows[0] ?? null);
        if (!record) throw notFound("Payment record not found");

        const { approvalConfirmed: _approvalConfirmed, paidAt, ...patch } = input;
        const nextCurrency = patch.currency ?? record.currency;
        if (nextCurrency !== entry.currency) {
          throw unprocessable("Payment record currency must match the payment entry currency");
        }
        const profileId = Object.prototype.hasOwnProperty.call(patch, "paymentProfileId")
          ? patch.paymentProfileId ?? null
          : record.paymentProfileId;
        if (profileId) {
          const profile = await tx
            .select()
            .from(paymentProfiles)
            .where(and(eq(paymentProfiles.companyId, companyId), eq(paymentProfiles.id, profileId)))
            .then((rows) => rows[0] ?? null);
          if (!profile) throw notFound("Payment profile not found");
        }

        const nextAmount = patch.amountCents ?? record.amountCents;
        const [{ total: othersTotal }] = await tx
          .select({ total: sql<number>`coalesce(sum(${paymentRecords.amountCents}), 0)::int` })
          .from(paymentRecords)
          .where(and(
            eq(paymentRecords.companyId, companyId),
            eq(paymentRecords.paymentEntryId, entryId),
            ne(paymentRecords.id, recordId),
          ));
        const projectedPaidAmountCents = Number(othersTotal ?? 0) + nextAmount;
        const nextStatus = statusFor(entry, projectedPaidAmountCents);
        if (nextStatus === "paid" && entry.status !== "paid" && entry.calendarItemId && !input.approvalConfirmed) {
          const calendarItem = await tx
            .select({ riskLevel: calendarItems.riskLevel })
            .from(calendarItems)
            .where(and(eq(calendarItems.companyId, companyId), eq(calendarItems.id, entry.calendarItemId)))
            .then((rows) => rows[0] ?? null);
          if (calendarItem && (calendarItem.riskLevel === "high" || calendarItem.riskLevel === "critical")) {
            throw unprocessable("Completing high-risk or critical items requires approval confirmation");
          }
        }

        await tx
          .update(paymentRecords)
          .set({
            ...patch,
            currency: nextCurrency,
            paymentProfileId: profileId,
            ...(paidAt ? { paidAt: new Date(paidAt) } : {}),
          })
          .where(and(eq(paymentRecords.companyId, companyId), eq(paymentRecords.id, recordId)));

        const [updated] = await tx
          .update(paymentEntries)
          .set({ paidAmountCents: projectedPaidAmountCents, status: nextStatus, updatedAt: new Date() })
          .where(and(eq(paymentEntries.companyId, companyId), eq(paymentEntries.id, entryId)))
          .returning();
        return {
          updated,
          completed: nextStatus === "paid" && entry.status !== "paid",
        };
      });
      return {
        entry: (await hydrateEntries([result.updated]))[0]!,
        completed: result.completed,
      };
    },

    deleteRecord: async (companyId: string, entryId: string, recordId: string) => {
      const updated = await db.transaction(async (tx) => {
        const entry = await tx
          .select()
          .from(paymentEntries)
          .where(and(eq(paymentEntries.companyId, companyId), eq(paymentEntries.id, entryId)))
          .for("update")
          .then((rows) => rows[0] ?? null);
        if (!entry) throw notFound("Payment entry not found");
        if (entry.status === "cancelled") throw unprocessable("Cancelled entries cannot be edited");
        const record = await tx
          .select()
          .from(paymentRecords)
          .where(and(
            eq(paymentRecords.companyId, companyId),
            eq(paymentRecords.paymentEntryId, entryId),
            eq(paymentRecords.id, recordId),
          ))
          .then((rows) => rows[0] ?? null);
        if (!record) throw notFound("Payment record not found");

        await tx
          .delete(paymentRecords)
          .where(and(eq(paymentRecords.companyId, companyId), eq(paymentRecords.id, recordId)));

        const [{ total }] = await tx
          .select({ total: sql<number>`coalesce(sum(${paymentRecords.amountCents}), 0)::int` })
          .from(paymentRecords)
          .where(and(eq(paymentRecords.companyId, companyId), eq(paymentRecords.paymentEntryId, entryId)));
        const projectedPaidAmountCents = Number(total ?? 0);
        // Deleting records only lowers the paid total; recompute status but never reverse a completed
        // calendar item automatically.
        const nextStatus = statusFor(entry, projectedPaidAmountCents);
        const [row] = await tx
          .update(paymentEntries)
          .set({ paidAmountCents: projectedPaidAmountCents, status: nextStatus, updatedAt: new Date() })
          .where(and(eq(paymentEntries.companyId, companyId), eq(paymentEntries.id, entryId)))
          .returning();
        return row;
      });
      return { entry: (await hydrateEntries([updated]))[0]! };
    },

    ensureEntryForCalendarItem: async (item: CalendarPaymentItem, options?: { advanceCycle?: boolean }) => {
      const dueDate = dateOnly(item.nextDueDate);
      const linkedEntries = await db
        .select()
        .from(paymentEntries)
        .where(and(
          eq(paymentEntries.companyId, item.companyId),
          eq(paymentEntries.calendarItemId, item.id),
          ne(paymentEntries.status, "cancelled"),
        ))
        .orderBy(asc(paymentEntries.createdAt));
      const qualifies = item.category === "payment_payable" && (item.status === "active" || item.status === "overdue");
      if (!qualifies || !dueDate || !item.paymentProfileId) {
        const staleEntries = linkedEntries.filter((entry) => entry.status !== "paid");
        if (staleEntries.length > 0) {
          await db
            .update(paymentEntries)
            .set({ status: "cancelled", updatedAt: new Date() })
            .where(and(
              eq(paymentEntries.companyId, item.companyId),
              inArray(paymentEntries.id, staleEntries.map((entry) => entry.id)),
            ));
        }
        return null;
      }
      await assertProfile(db, item.companyId, item.paymentProfileId);
      const existing = (() => {
          if (options?.advanceCycle) {
            return linkedEntries.find((row) => dateOnly(row.dueDate) === dueDate) ?? null;
          }
          return linkedEntries.find((row) => row.status !== "paid") ?? null;
      })();
      const values = {
        title: item.title,
        providerName: item.providerName,
        dueDate,
        expectedAmountCents: item.amountCents,
        currency: item.currency,
        paymentProfileId: item.paymentProfileId,
        updatedAt: new Date(),
      };
      if (existing) {
        if (existing.status === "paid") return rowToEntry(existing);
        const [updated] = await db
          .update(paymentEntries)
          .set(values)
          .where(and(eq(paymentEntries.companyId, item.companyId), eq(paymentEntries.id, existing.id)))
          .returning();
        return reconcileEntry(updated);
      }
      const [created] = await db
        .insert(paymentEntries)
        .values({
          ...values,
          companyId: item.companyId,
          calendarItemId: item.id,
        })
        .returning();
      return (await hydrateEntries([created]))[0]!;
    },

    completeCurrentEntryForCalendarItem: async (item: CalendarPaymentItem, paidAt = new Date()) => {
      if (item.category !== "payment_payable") return null;
      const dueDate = dateOnly(item.nextDueDate);
      if (!dueDate) return null;
      const existing = await db
        .select()
        .from(paymentEntries)
        .where(and(
          eq(paymentEntries.companyId, item.companyId),
          eq(paymentEntries.calendarItemId, item.id),
          eq(paymentEntries.dueDate, dueDate),
          ne(paymentEntries.status, "cancelled"),
        ))
        .orderBy(asc(paymentEntries.createdAt))
        .then((rows) => rows[0] ?? null);
      if (!existing) return null;
      if (existing.status === "paid") return rowToEntry(existing);
      const paidAmountCents = existing.expectedAmountCents == null
        ? existing.paidAmountCents
        : Math.max(existing.paidAmountCents, existing.expectedAmountCents);
      const recordedAmountCents = await paidAmountForEntry(db, item.companyId, existing.id);
      const recordAmountCents = Math.max(paidAmountCents - recordedAmountCents, 0);
      if (recordAmountCents > 0) {
        await db.insert(paymentRecords).values({
          companyId: item.companyId,
          paymentEntryId: existing.id,
          paymentProfileId: existing.paymentProfileId,
          amountCents: recordAmountCents,
          currency: existing.currency,
          paidAt,
          notes: "Marked paid from calendar completion",
        });
      }
      const [updated] = await db
        .update(paymentEntries)
        .set({ paidAmountCents, status: "paid", updatedAt: new Date() })
        .where(and(eq(paymentEntries.companyId, item.companyId), eq(paymentEntries.id, existing.id)))
        .returning();
      return (await hydrateEntries([updated]))[0]!;
    },

    dashboard: async (companyId: string, now = new Date()) => {
      const rows = await db
        .select()
        .from(paymentEntries)
        .where(and(eq(paymentEntries.companyId, companyId), inArray(paymentEntries.status, ["open", "partially_paid", "paid"])));
      const today = dateOnly(now)!;
      const dueSoon = new Date(now);
      dueSoon.setUTCDate(dueSoon.getUTCDate() + 7);
      const dueSoonText = dateOnly(dueSoon)!;
      const openRows = rows.filter((row) => row.status === "open" || row.status === "partially_paid");
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      const monthPaid = await db
        .select({
          currency: paymentRecords.currency,
          total: sql<number>`coalesce(sum(${paymentRecords.amountCents}), 0)::int`,
        })
        .from(paymentRecords)
        .where(and(eq(paymentRecords.companyId, companyId), gte(paymentRecords.paidAt, monthStart), lt(paymentRecords.paidAt, nextMonthStart)))
        .groupBy(paymentRecords.currency);
      const openBalanceByCurrency = new Map<string, number>();
      for (const row of openRows) {
        const balance = Math.max((row.expectedAmountCents ?? 0) - row.paidAmountCents, 0);
        openBalanceByCurrency.set(row.currency, (openBalanceByCurrency.get(row.currency) ?? 0) + balance);
      }
      const paidThisMonthByCurrency = new Map<string, number>();
      for (const row of monthPaid) {
        paidThisMonthByCurrency.set(row.currency, Number(row.total ?? 0));
      }
      return {
        companyId,
        generatedAt: now.toISOString(),
        openCount: openRows.length,
        overdueCount: openRows.filter((row) => row.dueDate && dateOnly(row.dueDate)! < today).length,
        dueSoonCount: openRows.filter((row) => row.dueDate && dateOnly(row.dueDate)! >= today && dateOnly(row.dueDate)! <= dueSoonText).length,
        partiallyPaidCount: rows.filter((row) => row.status === "partially_paid").length,
        openBalances: sortedMoneyTotals(openBalanceByCurrency),
        paidThisMonth: sortedMoneyTotals(paidThisMonthByCurrency),
      };
    },
  };
}
