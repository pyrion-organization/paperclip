import { describe, expect, it, vi } from "vitest";
import { issues } from "@paperclipai/db";
import { issueSchedulerService } from "../services/issue-scheduler.js";

const { queueIssueAssignmentWakeupMock } = vi.hoisted(() => ({
  queueIssueAssignmentWakeupMock: vi.fn(),
}));

vi.mock("../services/issue-assignment-wakeup.js", () => ({
  queueIssueAssignmentWakeup: queueIssueAssignmentWakeupMock,
}));

function makeDb({ dueRows, promotedRows }: { dueRows: unknown[]; promotedRows: unknown[] }) {
  return {
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => ({
        where: vi.fn(() => Promise.resolve(table === issues ? dueRows : [])),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve(promotedRows)),
        })),
      })),
    })),
  };
}

describe("issueSchedulerService", () => {
  it("does not count or wake stale scheduled issues that no longer match promotion predicates", async () => {
    queueIssueAssignmentWakeupMock.mockClear();
    const now = new Date("2026-06-02T00:00:00.000Z");
    const staleIssue = {
      id: "issue-1",
      status: "backlog",
      scheduledAt: now,
      assigneeAgentId: "agent-1",
    };
    const db = makeDb({ dueRows: [staleIssue], promotedRows: [] });

    const result = await issueSchedulerService(db as any, {} as any).tickScheduledIssues(now);

    expect(result).toEqual({ promoted: 0 });
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(queueIssueAssignmentWakeupMock).not.toHaveBeenCalled();
  });

  it("queues wakeup from the row returned by the conditional promotion", async () => {
    queueIssueAssignmentWakeupMock.mockClear();
    const now = new Date("2026-06-02T00:00:00.000Z");
    const dueIssue = {
      id: "issue-1",
      status: "backlog",
      scheduledAt: now,
      assigneeAgentId: "stale-agent",
    };
    const promotedIssue = {
      ...dueIssue,
      status: "todo",
      assigneeAgentId: "current-agent",
    };
    const db = makeDb({ dueRows: [dueIssue], promotedRows: [promotedIssue] });

    const result = await issueSchedulerService(db as any, {} as any).tickScheduledIssues(now);

    expect(result).toEqual({ promoted: 1 });
    expect(queueIssueAssignmentWakeupMock).toHaveBeenCalledWith(expect.objectContaining({
      issue: { id: "issue-1", assigneeAgentId: "current-agent", status: "todo" },
      mutation: "scheduled_start",
    }));
  });
});
