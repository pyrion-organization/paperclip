import { describe, expect, it, vi } from "vitest";
import { execute } from "./execute.js";
import { runChildProcess } from "../utils.js";

vi.mock("../utils.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils.js")>();
  return {
    ...actual,
    runChildProcess: vi.fn(async () => ({
      exitCode: 0,
      signal: null,
      timedOut: false,
      stdout: "ok",
      stderr: "",
    })),
  };
});

describe("process adapter execute", () => {
  it("runs with the same normalized environment used for validation and metadata", async () => {
    const onMeta = vi.fn();
    await execute({
      runId: "run-1",
      agent: {
        id: "agent-1",
        companyId: "company-1",
        name: "Process Agent",
        role: "worker",
      },
      config: {
        command: "node",
        args: ["--version"],
        env: {
          CUSTOM_ENV: "configured",
        },
      },
      onLog: vi.fn(),
      onMeta,
    } as never);

    const call = vi.mocked(runChildProcess).mock.calls[0];
    expect(call?.[3].env.CUSTOM_ENV).toBe("configured");
    expect(call?.[3].env.PATH).toBeTruthy();
    expect(onMeta.mock.calls[0]?.[0].env.PAPERCLIP_RESOLVED_COMMAND).toBeTruthy();
  });
});
