export interface DetectedScriptArg {
  name: string;
  takesValue: boolean;
  default: string | null;
  description: string | null;
}

const OPTION_LINE_RE = /^\s{2,}(?:-[A-Za-z], )?(--[A-Za-z0-9][A-Za-z0-9-]*)(?:[ =]([A-Z_][A-Z0-9_]*|<[^>]+>|\[[^\]]+\]))?(?:\s{2,}(.+))?$/;
const DEFAULT_PAREN_RE = /\(default(?:\s*[:=]\s*|\s+)([^)]+)\)/i;
const DEFAULT_TRAIL_RE = /\[default:\s*([^\]]+)\]/i;

export function parseHelpOutput(output: string): DetectedScriptArg[] {
  const seen = new Map<string, DetectedScriptArg>();
  for (const rawLine of output.split(/\r?\n/)) {
    const match = rawLine.match(OPTION_LINE_RE);
    if (!match) continue;
    const [, flag, valueToken, descriptionRaw] = match;
    const takesValue = Boolean(valueToken);
    const description = descriptionRaw?.trim() ?? null;
    let defaultValue: string | null = null;
    if (description) {
      const paren = description.match(DEFAULT_PAREN_RE);
      const trail = description.match(DEFAULT_TRAIL_RE);
      const hit = paren?.[1] ?? trail?.[1] ?? null;
      if (hit) defaultValue = hit.trim().replace(/^['"]|['"]$/g, "");
    }
    if (!seen.has(flag)) {
      seen.set(flag, { name: flag, takesValue, default: defaultValue, description });
    }
  }
  return Array.from(seen.values());
}
