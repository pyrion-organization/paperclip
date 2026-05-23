// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadDynamicParser, invalidateDynamicParser, setDynamicParserResultNotifier } from "./dynamic-loader";
import type { SandboxRequest, SandboxResponse } from "./sandboxed-parser-worker";
import { buildTranscript, type RunLogChunk } from "./transcript";

const adapterType = "stateful_dynamic";
const ts = "2026-03-20T13:00:00.000Z";

const statefulParserSource = `
module.exports = {
  createStdoutParser() {
    let pending = null;
    return {
      parseLine(line, ts) {
        if (line.startsWith("begin:")) {
          pending = line.slice("begin:".length);
          return [];
        }
        if (line === "finish" && pending) {
          const text = "completed:" + pending;
          pending = null;
          return [{ kind: "stdout", ts, text }];
        }
        return [{ kind: "stdout", ts, text: "literal:" + line }];
      },
      reset() {
        pending = null;
      },
    };
  },
};
`;

function flushWorkerResults() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function stdout(chunk: string): RunLogChunk[] {
  return [{ ts, stream: "stdout", chunk }];
}

describe("loadDynamicParser", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        text: async () => statefulParserSource,
      })),
    );
    vi.stubGlobal("Blob", class Blob {});
    vi.stubGlobal("URL", {
      createObjectURL: () => "blob:parser",
      revokeObjectURL: () => undefined,
    });
    vi.stubGlobal("Worker", FakeWorker);
  });

  afterEach(() => {
    invalidateDynamicParser(adapterType);
    setDynamicParserResultNotifier(null);
    vi.unstubAllGlobals();
  });

  it("keeps createStdoutParser state isolated across transcript builds", async () => {
    const notify = vi.fn();
    setDynamicParserResultNotifier(notify);

    const parserModule = await loadDynamicParser(adapterType);
    expect(parserModule?.createStdoutParser).toBeTypeOf("function");

    expect(buildTranscript(stdout("begin:task-a\nfinish\n"), parserModule!)).toEqual([]);
    await flushWorkerResults();
    await flushWorkerResults();

    expect(buildTranscript(stdout("begin:task-a\nfinish\n"), parserModule!)).toEqual([
      { kind: "stdout", ts, text: "completed:task-a" },
    ]);

    expect(buildTranscript(stdout("begin:task-a\n"), parserModule!)).toEqual([]);
    await flushWorkerResults();

    expect(buildTranscript(stdout("finish\n"), parserModule!)).toEqual([]);
    await flushWorkerResults();

    expect(buildTranscript(stdout("finish\n"), parserModule!)).toEqual([
      { kind: "stdout", ts, text: "literal:finish" },
    ]);
    expect(notify).toHaveBeenCalled();
  });
});

class FakeWorker {
  onmessage: ((event: MessageEvent<SandboxResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  private parseStdoutLine: ((line: string, ts: string) => unknown[]) | null = null;
  private createStdoutParser: (() => { parseLine: (line: string, ts: string) => unknown[]; reset: () => void }) | null =
    null;
  private sessions = new Map<string, { parseLine: (line: string, ts: string) => unknown[]; reset: () => void }>();

  postMessage(msg: SandboxRequest) {
    if (msg.type === "init") {
      const exports: Record<string, unknown> = {};
      const module = { exports };
      const factory = new Function("exports", "module", msg.source);
      factory(exports, module);

      const resolved = module.exports && Object.keys(module.exports).length > 0 ? module.exports : exports;
      this.parseStdoutLine =
        typeof resolved.parseStdoutLine === "function"
          ? (resolved.parseStdoutLine as (line: string, ts: string) => unknown[])
          : null;
      this.createStdoutParser =
        typeof resolved.createStdoutParser === "function"
          ? (resolved.createStdoutParser as () => { parseLine: (line: string, ts: string) => unknown[]; reset: () => void })
          : null;

      this.emit({ type: "ready", hasStdoutParserFactory: !!this.createStdoutParser });
      return;
    }

    if (msg.type === "parse") {
      this.emit({
        type: "result",
        id: msg.id,
        entries: this.parse(msg),
      });
      return;
    }

    if (msg.type === "reset_parser") {
      this.sessions.get(msg.parserId)?.reset();
      this.sessions.delete(msg.parserId);
    }
  }

  terminate() {}

  private parse(msg: Extract<SandboxRequest, { type: "parse" }>) {
    if (msg.parserId && this.createStdoutParser) {
      let parser = this.sessions.get(msg.parserId);
      if (!parser) {
        parser = this.createStdoutParser();
        this.sessions.set(msg.parserId, parser);
      }
      return parser.parseLine(msg.line, msg.ts);
    }

    if (this.parseStdoutLine) {
      return this.parseStdoutLine(msg.line, msg.ts);
    }

    if (this.createStdoutParser) {
      const parser = this.createStdoutParser();
      const entries = parser.parseLine(msg.line, msg.ts);
      parser.reset();
      return entries;
    }

    return [];
  }

  private emit(response: SandboxResponse) {
    queueMicrotask(() => {
      this.onmessage?.({ data: response } as MessageEvent<SandboxResponse>);
    });
  }
}
