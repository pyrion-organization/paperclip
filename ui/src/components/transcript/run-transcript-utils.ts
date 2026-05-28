import type { TranscriptEntry } from "../../adapters";
import { formatTokens } from "../../lib/utils";
import type { TranscriptDensity } from "./RunTranscriptView";

export type TranscriptBlock =
  | {
      type: "message";
      role: "assistant" | "user";
      ts: string;
      text: string;
      streaming: boolean;
    }
  | {
      type: "thinking";
      ts: string;
      text: string;
      streaming: boolean;
    }
  | {
      type: "tool";
      ts: string;
      endTs?: string;
      name: string;
      toolUseId?: string;
      input: unknown;
      result?: string;
      isError?: boolean;
      status: "running" | "completed" | "error";
    }
  | {
      type: "activity";
      ts: string;
      activityId?: string;
      name: string;
      status: "running" | "completed";
    }
  | {
      type: "command_group";
      ts: string;
      endTs?: string;
      items: Array<{
        ts: string;
        endTs?: string;
        input: unknown;
        result?: string;
        isError?: boolean;
        status: "running" | "completed" | "error";
      }>;
    }
  | {
      type: "tool_group";
      ts: string;
      endTs?: string;
      items: Array<{
        ts: string;
        endTs?: string;
        name: string;
        input: unknown;
        result?: string;
        isError?: boolean;
        status: "running" | "completed" | "error";
      }>;
    }
  | {
      type: "stderr_group";
      ts: string;
      endTs?: string;
      lines: Array<{ ts: string; text: string }>;
    }
  | {
      type: "system_group";
      ts: string;
      endTs?: string;
      lines: Array<{ ts: string; text: string }>;
    }
  | {
      type: "stdout";
      ts: string;
      text: string;
    }
  | {
      type: "event";
      ts: string;
      label: string;
      tone: "info" | "warn" | "error" | "neutral";
      text: string;
      detail?: string;
    }
  | {
      type: "diff_group";
      ts: string;
      endTs?: string;
      filePath?: string;
      hunks: Array<{
        changeType: "add" | "remove" | "context" | "hunk" | "file_header" | "truncation";
        text: string;
      }>;
    };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, Math.max(0, max - 1))}…` : value;
}

export function humanizeLabel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function stripWrappedShell(command: string): string {
  const trimmed = compactWhitespace(command);
  const shellWrapped = trimmed.match(/^(?:(?:\/bin\/)?(?:zsh|bash|sh)|cmd(?:\.exe)?(?:\s+\/d)?(?:\s+\/s)?(?:\s+\/c)?)\s+(?:-lc|\/c)\s+(.+)$/i);
  const inner = shellWrapped?.[1] ?? trimmed;
  const quoted = inner.match(/^(['"])([\s\S]*)\1$/);
  return compactWhitespace(quoted?.[2] ?? inner);
}

function formatUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function formatToolPayload(value: unknown): string {
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  return formatUnknown(value);
}

function extractToolUseId(input: unknown): string | undefined {
  const record = asRecord(input);
  if (!record) return undefined;
  const candidates = [
    record.toolUseId,
    record.tool_use_id,
    record.callId,
    record.call_id,
    record.id,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }
  return undefined;
}

function summarizeRecord(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return truncate(compactWhitespace(value), 120);
    }
  }
  return null;
}

export function summarizeToolInput(name: string, input: unknown, density: TranscriptDensity): string {
  const compactMax = density === "compact" ? 72 : 120;
  if (typeof input === "string") {
    const normalized = isCommandTool(name, input) ? stripWrappedShell(input) : compactWhitespace(input);
    return truncate(normalized, compactMax);
  }
  const record = asRecord(input);
  if (!record) {
    const serialized = compactWhitespace(formatUnknown(input));
    return serialized ? truncate(serialized, compactMax) : `Inspect ${name} input`;
  }

  const command = typeof record.command === "string"
    ? record.command
    : typeof record.cmd === "string"
      ? record.cmd
      : null;
  if (command && isCommandTool(name, record)) {
    return truncate(stripWrappedShell(command), compactMax);
  }

  const direct =
    summarizeRecord(record, ["command", "cmd", "path", "filePath", "file_path", "query", "url", "prompt", "message"])
    ?? summarizeRecord(record, ["pattern", "name", "title", "target", "tool"])
    ?? null;
  if (direct) return truncate(direct, compactMax);

  if (Array.isArray(record.paths) && record.paths.length > 0) {
    const first = record.paths.find((value): value is string => typeof value === "string" && value.trim().length > 0);
    if (first) {
      return truncate(`${record.paths.length} paths, starting with ${first}`, compactMax);
    }
  }

  const keys = Object.keys(record);
  if (keys.length === 0) return `No ${name} input`;
  if (keys.length === 1) return truncate(`${keys[0]} payload`, compactMax);
  return truncate(`${keys.length} fields: ${keys.slice(0, 3).join(", ")}`, compactMax);
}

export function parseStructuredToolResult(result: string | undefined) {
  if (!result) return null;
  const lines = result.split(/\r?\n/);
  const metadata = new Map<string, string>();
  let bodyStartIndex = lines.findIndex((line) => line.trim() === "");
  if (bodyStartIndex === -1) bodyStartIndex = lines.length;

  for (let index = 0; index < bodyStartIndex; index += 1) {
    const match = lines[index]?.match(/^([a-z_]+):\s*(.+)$/i);
    if (match) {
      metadata.set(match[1].toLowerCase(), compactWhitespace(match[2]));
    }
  }

  const body = lines.slice(Math.min(bodyStartIndex + 1, lines.length))
    .flatMap((line) => {
      const compacted = compactWhitespace(line);
      return compacted ? [compacted] : [];
    })
    .join("\n");

  return {
    command: metadata.get("command") ?? null,
    status: metadata.get("status") ?? null,
    exitCode: metadata.get("exit_code") ?? null,
    body,
  };
}

export function isCommandTool(name: string, input: unknown): boolean {
  if (name === "command_execution" || name === "shell" || name === "shellToolCall" || name === "bash") {
    return true;
  }
  if (typeof input === "string") {
    return /\b(?:bash|zsh|sh|cmd|powershell)\b/i.test(input);
  }
  const record = asRecord(input);
  return Boolean(record && (typeof record.command === "string" || typeof record.cmd === "string"));
}

function displayToolName(name: string, input: unknown): string {
  if (isCommandTool(name, input)) return "Executing command";
  return humanizeLabel(name);
}

export function summarizeToolResult(result: string | undefined, isError: boolean | undefined, density: TranscriptDensity): string {
  if (!result) return isError ? "Tool failed" : "Waiting for result";
  const structured = parseStructuredToolResult(result);
  if (structured) {
    if (structured.body) {
      return truncate(structured.body.split("\n")[0] ?? structured.body, density === "compact" ? 84 : 140);
    }
    if (structured.status === "completed") return "Completed";
    if (structured.status === "failed" || structured.status === "error") {
      return structured.exitCode ? `Failed with exit code ${structured.exitCode}` : "Failed";
    }
  }
  const lines = result
    .split(/\r?\n/)
    .flatMap((line) => {
      const compacted = compactWhitespace(line);
      return compacted ? [compacted] : [];
    });
  const firstLine = lines[0] ?? result;
  return truncate(firstLine, density === "compact" ? 84 : 140);
}

function parseSystemActivity(text: string): { activityId?: string; name: string; status: "running" | "completed" } | null {
  const match = text.match(/^item (started|completed):\s*([a-z0-9_-]+)(?:\s+\(id=([^)]+)\))?$/i);
  if (!match) return null;
  return {
    status: match[1].toLowerCase() === "started" ? "running" : "completed",
    name: humanizeLabel(match[2] ?? "Activity"),
    activityId: match[3] || undefined,
  };
}

function shouldHideNiceModeStderr(text: string): boolean {
  const normalized = compactWhitespace(text).toLowerCase();
  return normalized.startsWith("[paperclip] skipping saved session resume");
}

function groupCommandBlocks(blocks: TranscriptBlock[]): TranscriptBlock[] {
  const grouped: TranscriptBlock[] = [];
  let pending: Array<Extract<TranscriptBlock, { type: "command_group" }>["items"][number]> = [];
  let groupTs: string | null = null;
  let groupEndTs: string | undefined;

  const flush = () => {
    if (pending.length === 0 || !groupTs) return;
    grouped.push({
      type: "command_group",
      ts: groupTs,
      endTs: groupEndTs,
      items: pending,
    });
    pending = [];
    groupTs = null;
    groupEndTs = undefined;
  };

  for (const block of blocks) {
    if (block.type === "tool" && isCommandTool(block.name, block.input)) {
      if (!groupTs) {
        groupTs = block.ts;
      }
      groupEndTs = block.endTs ?? block.ts;
      pending.push({
        ts: block.ts,
        endTs: block.endTs,
        input: block.input,
        result: block.result,
        isError: block.isError,
        status: block.status,
      });
      continue;
    }

    flush();
    grouped.push(block);
  }

  flush();
  return grouped;
}

function groupToolBlocks(blocks: TranscriptBlock[]): TranscriptBlock[] {
  const grouped: TranscriptBlock[] = [];
  let pending: Array<Extract<TranscriptBlock, { type: "tool_group" }>["items"][number]> = [];
  let groupTs: string | null = null;
  let groupEndTs: string | undefined;

  const flush = () => {
    if (pending.length === 0 || !groupTs) return;
    grouped.push({
      type: "tool_group",
      ts: groupTs,
      endTs: groupEndTs,
      items: pending,
    });
    pending = [];
    groupTs = null;
    groupEndTs = undefined;
  };

  for (const block of blocks) {
    if (block.type === "tool" && !isCommandTool(block.name, block.input)) {
      if (!groupTs) groupTs = block.ts;
      groupEndTs = block.endTs ?? block.ts;
      pending.push({
        ts: block.ts,
        endTs: block.endTs,
        name: block.name,
        input: block.input,
        result: block.result,
        isError: block.isError,
        status: block.status,
      });
      continue;
    }
    flush();
    grouped.push(block);
  }
  flush();
  return grouped;
}

export function normalizeTranscript(entries: TranscriptEntry[], streaming: boolean): TranscriptBlock[] {
  const blocks: TranscriptBlock[] = [];
  const pendingToolBlocks = new Map<string, Extract<TranscriptBlock, { type: "tool" }>>();
  const pendingActivityBlocks = new Map<string, Extract<TranscriptBlock, { type: "activity" }>>();
  const runningToolBlocks: Extract<TranscriptBlock, { type: "tool" }>[] = [];
  const runningCommandBlocks: Extract<TranscriptBlock, { type: "tool" }>[] = [];

  const removeRunningBlock = (
    stack: Extract<TranscriptBlock, { type: "tool" }>[],
    block: Extract<TranscriptBlock, { type: "tool" }>,
  ): void => {
    for (let index = stack.length - 1; index >= 0; index -= 1) {
      if (stack[index] === block) {
        stack.splice(index, 1);
        return;
      }
    }
  };

  for (const entry of entries) {
    const previous = blocks[blocks.length - 1];

    if (entry.kind === "assistant" || entry.kind === "user") {
      const isStreaming = streaming && entry.kind === "assistant" && entry.delta === true;
      if (previous?.type === "message" && previous.role === entry.kind) {
        previous.text += previous.text.endsWith("\n") || entry.text.startsWith("\n") ? entry.text : `\n${entry.text}`;
        previous.ts = entry.ts;
        previous.streaming = previous.streaming || isStreaming;
      } else {
        blocks.push({
          type: "message",
          role: entry.kind,
          ts: entry.ts,
          text: entry.text,
          streaming: isStreaming,
        });
      }
      continue;
    }

    if (entry.kind === "thinking") {
      const isStreaming = streaming && entry.delta === true;
      if (previous?.type === "thinking") {
        previous.text += previous.text.endsWith("\n") || entry.text.startsWith("\n") ? entry.text : `\n${entry.text}`;
        previous.ts = entry.ts;
        previous.streaming = previous.streaming || isStreaming;
      } else {
        blocks.push({
          type: "thinking",
          ts: entry.ts,
          text: entry.text,
          streaming: isStreaming,
        });
      }
      continue;
    }

    if (entry.kind === "tool_call") {
      const toolBlock: Extract<TranscriptBlock, { type: "tool" }> = {
        type: "tool",
        ts: entry.ts,
        name: displayToolName(entry.name, entry.input),
        toolUseId: entry.toolUseId ?? extractToolUseId(entry.input),
        input: entry.input,
        status: "running",
      };
      blocks.push(toolBlock);
      runningToolBlocks.push(toolBlock);
      if (isCommandTool(toolBlock.name, toolBlock.input)) {
        runningCommandBlocks.push(toolBlock);
      }
      if (toolBlock.toolUseId) {
        pendingToolBlocks.set(toolBlock.toolUseId, toolBlock);
      }
      continue;
    }

    if (entry.kind === "tool_result") {
      const matched =
        pendingToolBlocks.get(entry.toolUseId)
        ?? runningToolBlocks[runningToolBlocks.length - 1];

      if (matched) {
        matched.result = entry.content;
        matched.isError = entry.isError;
        matched.status = entry.isError ? "error" : "completed";
        matched.endTs = entry.ts;
        pendingToolBlocks.delete(entry.toolUseId);
        removeRunningBlock(runningToolBlocks, matched);
        removeRunningBlock(runningCommandBlocks, matched);
      } else {
        blocks.push({
          type: "tool",
          ts: entry.ts,
          endTs: entry.ts,
          name: entry.toolName ?? "tool",
          toolUseId: entry.toolUseId,
          input: null,
          result: entry.content,
          isError: entry.isError,
          status: entry.isError ? "error" : "completed",
        });
      }
      continue;
    }

    if (entry.kind === "init") {
      blocks.push({
        type: "event",
        ts: entry.ts,
        label: "init",
        tone: "info",
        text: `model ${entry.model}${entry.sessionId ? ` • session ${entry.sessionId}` : ""}`,
      });
      continue;
    }

    if (entry.kind === "result") {
      blocks.push({
        type: "event",
        ts: entry.ts,
        label: "result",
        tone: entry.isError ? "error" : "info",
        text: entry.text.trim() || entry.errors[0] || (entry.isError ? "Run failed" : "Completed"),
        detail:
          !entry.isError && entry.text.trim().length > 0
            ? `${formatTokens(entry.inputTokens)} / ${formatTokens(entry.outputTokens)} / $${entry.costUsd.toFixed(6)}`
            : undefined,
      });
      continue;
    }

    if (entry.kind === "stderr") {
      if (shouldHideNiceModeStderr(entry.text)) {
        continue;
      }
      const prev = blocks[blocks.length - 1];
      if (prev && prev.type === "stderr_group") {
        prev.lines.push({ ts: entry.ts, text: entry.text });
        prev.endTs = entry.ts;
      } else {
        blocks.push({
          type: "stderr_group",
          ts: entry.ts,
          endTs: entry.ts,
          lines: [{ ts: entry.ts, text: entry.text }],
        });
      }
      continue;
    }

    if (entry.kind === "system") {
      if (compactWhitespace(entry.text).toLowerCase() === "turn started") {
        continue;
      }
      const activity = parseSystemActivity(entry.text);
      if (activity) {
        const existing = activity.activityId ? pendingActivityBlocks.get(activity.activityId) : undefined;
        if (existing) {
          existing.status = activity.status;
          existing.ts = entry.ts;
          if (activity.status === "completed" && activity.activityId) {
            pendingActivityBlocks.delete(activity.activityId);
          }
        } else {
          const block: Extract<TranscriptBlock, { type: "activity" }> = {
            type: "activity",
            ts: entry.ts,
            activityId: activity.activityId,
            name: activity.name,
            status: activity.status,
          };
          blocks.push(block);
          if (activity.status === "running" && activity.activityId) {
            pendingActivityBlocks.set(activity.activityId, block);
          }
        }
        continue;
      }
      const prev = blocks[blocks.length - 1];
      if (prev && prev.type === "system_group") {
        prev.lines.push({ ts: entry.ts, text: entry.text });
        prev.endTs = entry.ts;
      } else {
        blocks.push({
          type: "system_group",
          ts: entry.ts,
          endTs: entry.ts,
          lines: [{ ts: entry.ts, text: entry.text }],
        });
      }
      continue;
    }

    const activeCommandBlock = runningCommandBlocks[runningCommandBlocks.length - 1];
    if (activeCommandBlock) {
      activeCommandBlock.result = activeCommandBlock.result
        ? `${activeCommandBlock.result}${activeCommandBlock.result.endsWith("\n") || entry.text.startsWith("\n") ? entry.text : `\n${entry.text}`}`
        : entry.text;
      continue;
    }

    if (entry.kind === "diff") {
      const prev = blocks[blocks.length - 1];
      if (prev && prev.type === "diff_group") {
        if (entry.changeType === "file_header") {
          prev.filePath = entry.text;
        }
        prev.hunks.push({ changeType: entry.changeType, text: entry.text });
        prev.endTs = entry.ts;
      } else {
        blocks.push({
          type: "diff_group",
          ts: entry.ts,
          endTs: entry.ts,
          filePath: entry.changeType === "file_header" ? entry.text : undefined,
          hunks: [{ changeType: entry.changeType, text: entry.text }],
        });
      }
      continue;
    }

    if (previous?.type === "stdout") {
      previous.text += previous.text.endsWith("\n") || entry.text.startsWith("\n") ? entry.text : `\n${entry.text}`;
      previous.ts = entry.ts;
    } else {
      blocks.push({
        type: "stdout",
        ts: entry.ts,
        text: entry.text,
      });
    }
  }

  return groupToolBlocks(groupCommandBlocks(blocks));
}
