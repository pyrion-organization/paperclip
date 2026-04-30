import { describe, expect, it } from "vitest";
import { parseHelpOutput } from "./script-help-parser.js";

describe("parseHelpOutput", () => {
  it("parses argparse-style output with defaults", () => {
    const output = [
      "usage: hello.py [-h] [--name NAME] [--count COUNT] [--verbose]",
      "",
      "options:",
      "  -h, --help         show this help message and exit",
      "  --name NAME        the person's name (default: world)",
      "  --count COUNT      how many times (default: 1)",
      "  --verbose          talk a lot",
    ].join("\n");
    const args = parseHelpOutput(output);
    expect(args).toEqual([
      { name: "--help", takesValue: false, default: null, description: "show this help message and exit" },
      { name: "--name", takesValue: true, default: "world", description: "the person's name (default: world)" },
      { name: "--count", takesValue: true, default: "1", description: "how many times (default: 1)" },
      { name: "--verbose", takesValue: false, default: null, description: "talk a lot" },
    ]);
  });

  it("parses commander-style with angle bracket values", () => {
    const output = [
      "Usage: cli [options]",
      "",
      "Options:",
      "  -V, --version          output the version number",
      "  --port <number>        port to listen on [default: 3000]",
      "  --dry-run              only print what would happen",
    ].join("\n");
    const args = parseHelpOutput(output);
    expect(args.map((a) => a.name)).toEqual(["--version", "--port", "--dry-run"]);
    expect(args.find((a) => a.name === "--port")?.default).toBe("3000");
    expect(args.find((a) => a.name === "--dry-run")?.takesValue).toBe(false);
  });

  it("returns empty for unrelated output", () => {
    const args = parseHelpOutput("hello world\nnothing to see here");
    expect(args).toEqual([]);
  });

  it("dedups repeated flags, keeping first", () => {
    const output = "  --foo BAR   first\n  --foo BAR   second";
    const args = parseHelpOutput(output);
    expect(args.length).toBe(1);
    expect(args[0].description).toBe("first");
  });
});
