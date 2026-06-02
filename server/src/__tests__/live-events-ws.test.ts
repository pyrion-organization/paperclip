import type { IncomingMessage } from "node:http";
import { EventEmitter } from "node:events";
import type { Duplex } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { agentApiKeys, agents } from "@paperclipai/db";
import { authorizeUpgrade, setupLiveEventsWebSocketServer } from "../realtime/live-events-ws.js";

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

describe("setupLiveEventsWebSocketServer", () => {
  it("leaves unrelated websocket upgrade requests for other listeners", () => {
    const server = new EventEmitter();
    const socket = {
      destroy: vi.fn(),
      write: vi.fn(),
    } as unknown as Duplex;
    const req = {
      url: "/vite-hmr",
      headers: {},
    } as IncomingMessage;

    const wss = setupLiveEventsWebSocketServer(server as any, {} as any, {
      deploymentMode: "local_trusted",
    });

    server.emit("upgrade", req, socket, Buffer.alloc(0));

    expect(socket.write).not.toHaveBeenCalled();
    expect(socket.destroy).not.toHaveBeenCalled();
    (wss as any).emit("close");
  });
});
