import type { CreateConfigValues } from "../../components/AgentConfigForm";

function parseCommaArgs(value: string): string[] {
  return value
    .split(",")
    .flatMap((item) => {
      const trimmed = item.trim();
      return trimmed ? [trimmed] : [];
    });
}

export function buildProcessConfig(v: CreateConfigValues): Record<string, unknown> {
  const ac: Record<string, unknown> = {};
  if (v.cwd) ac.cwd = v.cwd;
  ac.timeoutSec = 0;
  ac.graceSec = 15;
  if (v.command) ac.command = v.command;
  if (v.args) ac.args = parseCommaArgs(v.args);
  return ac;
}
