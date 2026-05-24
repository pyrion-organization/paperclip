import type { IncomingMessage } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { agentApiKeys, agents } from "@paperclipai/db";
import { authorizeUpgrade } from "../realtime/live-events-ws.js";

function createSelectChain(rowsByTable: Map<unknown, unknown[]>) {
  return {
    from(table: unknown) {
      return {
        where() {
          return Promise.resolve(rowsByTable.get(table) ?? []);
        },
      };
    },
  };
}

describe("authorizeUpgrade", () => {
  it("rejects agent API keys whose agent belongs to another company", async () => {
    const update = vi.fn();
    const db = {
      select: vi.fn(() => createSelectChain(new Map<unknown, unknown[]>([
        [agentApiKeys, [{
          id: "key-1",
          agentId: "agent-1",
          companyId: "company-b",
          keyHash: "unused",
          revokedAt: null,
        }]],
        [agents, [{
          id: "agent-1",
          companyId: "company-a",
          status: "idle",
        }]],
      ]))),
      update,
    } as any;
    const req = {
      headers: {
        authorization: "Bearer stale-key",
      },
    } as IncomingMessage;

    const context = await authorizeUpgrade(
      db,
      req,
      "company-b",
      new URL("http://localhost/api/companies/company-b/events/ws"),
      { deploymentMode: "authenticated" },
    );

    expect(context).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });
});
