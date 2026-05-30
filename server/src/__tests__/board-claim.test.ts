import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimBoardOwnership,
  getBoardClaimWarningUrl,
  initializeBoardClaimChallenge,
} from "../board-claim.js";

vi.mock("../services/principal-access-compatibility.js", () => ({
  ensureHumanRoleDefaultGrants: vi.fn(async () => {}),
}));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function queryRows<T>(rows: T[]) {
  const promise = Promise.resolve(rows);
  return {
    where: () => promise,
    then: promise.then.bind(promise),
  };
}

function makeFakeDb(transactionGate?: Promise<void>) {
  const tx = {
    select: () => ({
      from: () => queryRows([{ id: "company-1" }]),
    }),
    insert: () => ({ values: async () => {} }),
    delete: () => ({ where: async () => {} }),
    update: () => ({ set: () => ({ where: async () => {} }) }),
  };

  return {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([{ userId: "local-board" }]),
      }),
    }),
    transaction: async (callback: (innerTx: typeof tx) => Promise<void>) => {
      await callback(tx);
      await transactionGate;
    },
  };
}

function readChallenge() {
  const warningUrl = getBoardClaimWarningUrl("127.0.0.1", 3100);
  if (!warningUrl) throw new Error("missing board claim warning URL");
  const url = new URL(warningUrl);
  return {
    token: url.pathname.split("/").pop()!,
    code: url.searchParams.get("code")!,
  };
}

describe("board claim", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks a claim unavailable before async ownership grants finish", async () => {
    const gate = deferred();
    const db = makeFakeDb(gate.promise);
    await initializeBoardClaimChallenge(db as never, { deploymentMode: "authenticated" });
    const challenge = readChallenge();

    const firstClaim = claimBoardOwnership(db as never, {
      ...challenge,
      userId: "user-1",
    });
    await Promise.resolve();

    await expect(claimBoardOwnership(db as never, {
      ...challenge,
      userId: "user-2",
    })).resolves.toEqual({ status: "claimed" });

    gate.resolve();
    await expect(firstClaim).resolves.toEqual({
      status: "claimed",
      claimedByUserId: "user-1",
    });
  });
});
