import { describe, expect, it } from "vitest";

import { getWorkerBootstrapSource } from "./sandboxed-parser-worker";

describe("sandboxed parser worker bootstrap", () => {
  it("disables child worker and object URL escape hatches", () => {
    const source = getWorkerBootstrapSource();

    expect(source).toContain("self.Worker = _undefined");
    expect(source).toContain("self.SharedWorker = _undefined");
    expect(source).toContain("self.Blob = _undefined");
    expect(source).toContain("self.RTCPeerConnection = _undefined");
    expect(source).toContain("self.RTCDataChannel = _undefined");
    expect(source).toContain('"createObjectURL"');
    expect(source).toContain('"revokeObjectURL"');
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
});
