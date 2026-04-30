import { describe, expect, it } from "vitest";
import { argsToPairs, buildPreviewCommand, pairsToArgs } from "./RoutineScriptConfig";

describe("argsToPairs / pairsToArgs", () => {
  it("round-trips flag+value pairs", () => {
    const flat = ["--name", "alice", "--count", "3"];
    const pairs = argsToPairs(flat);
    expect(pairs).toEqual([
      { name: "--name", value: "alice" },
      { name: "--count", value: "3" },
    ]);
    expect(pairsToArgs(pairs)).toEqual(flat);
  });

  it("treats boolean flags (no value) correctly", () => {
    const flat = ["--verbose", "--name", "alice"];
    const pairs = argsToPairs(flat);
    expect(pairs).toEqual([
      { name: "--verbose", value: "" },
      { name: "--name", value: "alice" },
    ]);
    expect(pairsToArgs(pairs)).toEqual(flat);
  });

  it("prefixes bare names with --", () => {
    expect(pairsToArgs([{ name: "name", value: "alice" }])).toEqual(["--name", "alice"]);
  });

  it("drops empty rows", () => {
    expect(pairsToArgs([{ name: "", value: "" }, { name: "--x", value: "1" }])).toEqual(["--x", "1"]);
  });

  it("builds preview command", () => {
    expect(
      buildPreviewCommand("script_python", "src/hello.py", [
        { name: "--name", value: "alice" },
        { name: "--verbose", value: "" },
      ]),
    ).toBe("python3 src/hello.py --name alice --verbose");
  });

  it("quotes values with spaces", () => {
    expect(
      buildPreviewCommand("script_nodejs", "app.js", [{ name: "--msg", value: "hello world" }]),
    ).toBe('node app.js --msg "hello world"');
  });
});
