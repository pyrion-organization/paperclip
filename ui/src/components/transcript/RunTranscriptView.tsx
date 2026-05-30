import { useEffect, useMemo, useRef, useState } from "react";
import type { TranscriptEntry } from "../../adapters";
import { MarkdownBody } from "../MarkdownBody";
import { cn, formatTokens } from "../../lib/utils";
import {
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  GitCompare,
  TerminalSquare,
  User,
  Wrench,
} from "lucide-react";
import {
  formatToolPayload,
  humanizeLabel,
  isCommandTool,
  normalizeTranscript,
  parseStructuredToolResult,
  summarizeToolInput,
  summarizeToolResult,
  truncate,
  type TranscriptBlock,
} from "./run-transcript-utils";

export type TranscriptMode = "nice" | "raw";
export type TranscriptDensity = "comfortable" | "compact";

const RAW_VIRTUALIZATION_THRESHOLD = 300;
const RAW_OVERSCAN_ROWS = 40;
const RAW_ESTIMATED_ROW_HEIGHT = 36;
const RAW_INITIAL_ROWS = 180;

interface RunTranscriptViewProps {
  entries: TranscriptEntry[];
  mode?: TranscriptMode;
  density?: TranscriptDensity;
  limit?: number;
  streaming?: boolean;
  collapseStdout?: boolean;
  emptyMessage?: string;
  className?: string;
  thinkingClassName?: string;
}

function TranscriptMessageBlock({
  block,
  density,
}: {
  block: Extract<TranscriptBlock, { type: "message" }>;
  density: TranscriptDensity;
}) {
  const isAssistant = block.role === "assistant";
  const compact = density === "compact";

  return (
    <div>
      {!isAssistant && (
        <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <User className={compact ? "size-3.5" : "size-4"} />
          <span>User</span>
        </div>
      )}
      <MarkdownBody
        className={cn(
          "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
          compact ? "text-xs leading-5 text-foreground/85" : "text-sm",
        )}
      >
        {block.text}
      </MarkdownBody>
      {block.streaming && (
        <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium italic text-muted-foreground">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-70" />
            <span className="relative inline-flex size-1.5 rounded-full bg-current" />
          </span>
          Streaming
        </div>
      )}
    </div>
  );
}

function TranscriptThinkingBlock({
  block,
  density,
  className,
}: {
  block: Extract<TranscriptBlock, { type: "thinking" }>;
  density: TranscriptDensity;
  className?: string;
}) {
  return (
    <MarkdownBody
      className={cn(
        "italic text-foreground/70 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        density === "compact" ? "text-[11px] leading-5" : "text-sm leading-6",
        className,
      )}
    >
      {block.text}
    </MarkdownBody>
  );
}

function TranscriptToolCard({
  block,
  density,
}: {
  block: Extract<TranscriptBlock, { type: "tool" }>;
  density: TranscriptDensity;
}) {
  const [open, setOpen] = useState(block.status === "error");
  const compact = density === "compact";
  const parsedResult = parseStructuredToolResult(block.result);
  const statusLabel =
    block.status === "running"
      ? "Running"
      : block.status === "error"
        ? "Errored"
        : "Completed";
  const statusTone =
    block.status === "running"
      ? "text-cyan-700 dark:text-cyan-300"
      : block.status === "error"
        ? "text-red-700 dark:text-red-300"
        : "text-emerald-700 dark:text-emerald-300";
  const detailsClass = cn(
    "space-y-3",
    block.status === "error" && "rounded-xl border border-red-500/20 bg-red-500/[0.06] p-3",
  );
  const iconClass = cn(
    "mt-0.5 size-3.5 shrink-0",
    block.status === "error"
      ? "text-red-600 dark:text-red-300"
      : block.status === "completed"
        ? "text-emerald-600 dark:text-emerald-300"
        : "text-cyan-600 dark:text-cyan-300",
  );
  const summary = block.status === "running"
    ? summarizeToolInput(block.name, block.input, density)
    : block.status === "completed" && parsedResult?.body
      ? truncate(parsedResult.body.split("\n")[0] ?? parsedResult.body, compact ? 84 : 140)
      : summarizeToolResult(block.result, block.isError, density);

  return (
    <div className={cn(block.status === "error" && "rounded-xl border border-red-500/20 bg-red-500/[0.04] p-3")}>
      <div className="flex items-start gap-2">
        {block.status === "error" ? (
          <CircleAlert className={iconClass} />
        ) : block.status === "completed" ? (
          <Check className={iconClass} />
        ) : (
          <Wrench className={iconClass} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {block.name}
            </span>
            <span className={cn("text-[10px] font-semibold uppercase tracking-[0.14em]", statusTone)}>
              {statusLabel}
            </span>
          </div>
          <div className={cn("mt-1 break-words text-foreground/80", compact ? "text-xs" : "text-sm")}>
            {summary}
          </div>
        </div>
        <button
          type="button"
          className="mt-0.5 inline-flex size-5 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => setOpen((value) => !value)}
          aria-label={open ? "Collapse tool details" : "Expand tool details"}
        >
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
      </div>
      {open && (
        <div className="mt-3">
          <div className={detailsClass}>
            <div className={cn("grid gap-3", compact ? "grid-cols-1" : "lg:grid-cols-2")}>
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Input
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] text-foreground/80">
                  {formatToolPayload(block.input) || "<empty>"}
                </pre>
              </div>
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Result
                </div>
                <pre className={cn(
                  "overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px]",
                  block.status === "error" ? "text-red-700 dark:text-red-300" : "text-foreground/80",
                )}>
                  {block.result ? formatToolPayload(block.result) : "Waiting for result..."}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function hasSelectedText() {
  if (typeof window === "undefined") return false;
  return (window.getSelection()?.toString().length ?? 0) > 0;
}

function TranscriptCommandGroup({
  block,
  density,
}: {
  block: Extract<TranscriptBlock, { type: "command_group" }>;
  density: TranscriptDensity;
}) {
  const [open, setOpen] = useState(false);
  const compact = density === "compact";
  const runningItem = [...block.items].reverse().find((item) => item.status === "running");
  const latestItem = block.items[block.items.length - 1] ?? null;
  const hasError = block.items.some((item) => item.status === "error");
  const isRunning = Boolean(runningItem);
  const showExpandedErrorState = open && hasError;
  const title = isRunning
    ? "Executing command"
    : block.items.length === 1
      ? "Executed command"
      : `Executed ${block.items.length} commands`;
  const subtitle = runningItem
    ? summarizeToolInput("command_execution", runningItem.input, density)
    : null;
  const statusTone = isRunning
      ? "text-cyan-700 dark:text-cyan-300"
      : "text-foreground/70";

  return (
    <div className={cn(showExpandedErrorState && "rounded-xl border border-red-500/20 bg-red-500/[0.04] p-3")}>
      <button
        type="button"
        className={cn("flex w-full cursor-pointer border-0 bg-transparent p-0 text-left text-inherit", subtitle ? "items-start" : "items-center")}
        onClick={() => {
          if (hasSelectedText()) return;
          setOpen((value) => !value);
        }}
      >
        <div className={cn("flex shrink-0 items-center", subtitle && "mt-0.5")}>
          {block.items.slice(0, Math.min(block.items.length, 3)).map((item, index) => (
            <span
              key={`${item.ts}:${item.status}`}
              className={cn(
                "inline-flex size-6 items-center justify-center rounded-full border shadow-sm",
                index > 0 && "-ml-1.5",
                isRunning
                  ? "border-cyan-500/25 bg-cyan-500/[0.08] text-cyan-600 dark:text-cyan-300"
                  : "border-border/70 bg-background text-foreground/55",
                isRunning && "animate-pulse",
              )}
            >
              <TerminalSquare className="size-3.5" />
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase leading-none tracking-[0.1em] text-muted-foreground/70">
            {title}
          </div>
          {subtitle && (
            <div className={cn("mt-1 break-words font-mono text-foreground/85", compact ? "text-xs" : "text-sm")}>
              {subtitle}
            </div>
          )}
          {!subtitle && latestItem?.status === "error" && open && (
            <div className={cn("mt-1", compact ? "text-xs" : "text-sm", statusTone)}>
              Command failed
            </div>
          )}
        </div>
        <span
          className={cn(
            "inline-flex size-5 items-center justify-center text-muted-foreground transition-colors",
            subtitle && "mt-0.5",
          )}
          aria-hidden="true"
        >
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </span>
      </button>
      {open && (
        <div className={cn("mt-3 space-y-3", hasError && "rounded-xl border border-red-500/20 bg-red-500/[0.06] p-3")}>
          {block.items.map((item, index) => (
            <div key={`${item.ts}-${index}`} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className={cn(
                  "inline-flex size-5 shrink-0 items-center justify-center rounded-full border",
                  item.status === "error"
                    ? "border-red-500/25 bg-red-500/[0.08] text-red-600 dark:text-red-300"
                    : item.status === "running"
                      ? "border-cyan-500/25 bg-cyan-500/[0.08] text-cyan-600 dark:text-cyan-300"
                      : "border-border/70 bg-background text-foreground/55",
                )}>
                  <TerminalSquare className="size-3" />
                </span>
                <span className={cn("font-mono break-all", compact ? "text-[11px]" : "text-xs")}>
                  {summarizeToolInput("command_execution", item.input, density)}
                </span>
              </div>
              {item.result && (
                <pre className={cn(
                  "overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px]",
                  item.status === "error" ? "text-red-700 dark:text-red-300" : "text-foreground/80",
                )}>
                  {formatToolPayload(item.result)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TranscriptToolGroup({
  block,
  density,
}: {
  block: Extract<TranscriptBlock, { type: "tool_group" }>;
  density: TranscriptDensity;
}) {
  const [open, setOpen] = useState(false);
  const compact = density === "compact";
  const runningItem = [...block.items].reverse().find((item) => item.status === "running");
  const hasError = block.items.some((item) => item.status === "error");
  const isRunning = Boolean(runningItem);
  const uniqueNames = [...new Set(block.items.map((item) => item.name))];
  const toolLabel =
    uniqueNames.length === 1
      ? humanizeLabel(uniqueNames[0])
      : `${uniqueNames.length} tools`;
  const title = isRunning
    ? `Using ${toolLabel}`
    : block.items.length === 1
      ? `Used ${toolLabel}`
      : `Used ${toolLabel} (${block.items.length} calls)`;
  const subtitle = runningItem
    ? summarizeToolInput(runningItem.name, runningItem.input, density)
    : null;
  const statusTone = isRunning
    ? "text-cyan-700 dark:text-cyan-300"
    : "text-foreground/70";

  return (
    <div className="rounded-xl border border-border/40 bg-muted/[0.25]">
      <button
        type="button"
        className={cn("flex w-full cursor-pointer border-0 bg-transparent px-3 py-2.5 text-left text-inherit", subtitle ? "items-start" : "items-center")}
        onClick={() => { if (hasSelectedText()) return; setOpen((v) => !v); }}
      >
        <div className={cn("flex shrink-0 items-center", subtitle && "mt-0.5")}>
          {block.items.slice(0, Math.min(block.items.length, 3)).map((item, index) => {
            const isItemRunning = item.status === "running";
            const isItemError = item.status === "error";
            return (
              <span
                key={`${item.ts}-${index}`}
                className={cn(
                  "inline-flex size-6 items-center justify-center rounded-full border shadow-sm",
                  index > 0 && "-ml-1.5",
                  isItemRunning
                    ? "border-cyan-500/25 bg-cyan-500/[0.08] text-cyan-600 dark:text-cyan-300"
                    : isItemError
                      ? "border-red-500/25 bg-red-500/[0.08] text-red-600 dark:text-red-300"
                      : "border-border/70 bg-background text-foreground/55",
                  isItemRunning && "animate-pulse",
                )}
              >
                <Wrench className="size-3.5" />
              </span>
            );
          })}
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn("font-semibold uppercase leading-none tracking-[0.1em]", compact ? "text-[10px]" : "text-[11px]", "text-muted-foreground/70")}>
            {title}
          </div>
          {subtitle && (
            <div className={cn("mt-1 break-words font-mono text-foreground/85", compact ? "text-xs" : "text-sm")}>
              {subtitle}
            </div>
          )}
        </div>
        <span
          className={cn("inline-flex size-5 items-center justify-center text-muted-foreground transition-colors", subtitle && "mt-0.5")}
          aria-hidden="true"
        >
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </span>
      </button>
      {open && (
        <div className={cn("space-y-2 border-t border-border/30 p-3", hasError && "rounded-b-xl")}>
          {block.items.map((item, index) => (
            <div key={`${item.ts}-${index}`} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className={cn(
                  "inline-flex size-5 shrink-0 items-center justify-center rounded-full border",
                  item.status === "error"
                    ? "border-red-500/25 bg-red-500/[0.08] text-red-600 dark:text-red-300"
                    : item.status === "running"
                      ? "border-cyan-500/25 bg-cyan-500/[0.08] text-cyan-600 dark:text-cyan-300"
                      : "border-border/70 bg-background text-foreground/55",
                )}>
                  <Wrench className="size-3" />
                </span>
                <span className={cn("text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground")}>
                  {humanizeLabel(item.name)}
                </span>
                <span className={cn("text-[10px] font-semibold uppercase tracking-[0.14em]",
                  item.status === "running" ? "text-cyan-700 dark:text-cyan-300"
                  : item.status === "error" ? "text-red-700 dark:text-red-300"
                  : "text-emerald-700 dark:text-emerald-300"
                )}>
                  {item.status === "running" ? "Running" : item.status === "error" ? "Errored" : "Completed"}
                </span>
              </div>
              <div className={cn("grid gap-2 pl-7", compact ? "grid-cols-1" : "lg:grid-cols-2")}>
                <div>
                  <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Input</div>
                  <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] text-foreground/80">
                    {formatToolPayload(item.input) || "<empty>"}
                  </pre>
                </div>
                {item.result && (
                  <div>
                    <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Result</div>
                    <pre className={cn(
                      "overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px]",
                      item.status === "error" ? "text-red-700 dark:text-red-300" : "text-foreground/80",
                    )}>
                      {formatToolPayload(item.result)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TranscriptActivityRow({
  block,
  density,
}: {
  block: Extract<TranscriptBlock, { type: "activity" }>;
  density: TranscriptDensity;
}) {
  return (
    <div className="flex items-start gap-2">
      {block.status === "completed" ? (
        <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-300" />
      ) : (
        <span className="relative mt-1 flex size-2.5 shrink-0">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-cyan-400 opacity-70" />
          <span className="relative inline-flex size-2.5 rounded-full bg-cyan-500" />
        </span>
      )}
      <div className={cn(
        "break-words text-foreground/80",
        density === "compact" ? "text-xs leading-5" : "text-sm leading-6",
      )}>
        {block.name}
      </div>
    </div>
  );
}

function TranscriptEventRow({
  block,
  density,
}: {
  block: Extract<TranscriptBlock, { type: "event" }>;
  density: TranscriptDensity;
}) {
  const compact = density === "compact";
  const toneClasses =
    block.tone === "error"
      ? "rounded-xl border border-red-500/20 bg-red-500/[0.06] p-3 text-red-700 dark:text-red-300"
      : block.tone === "warn"
        ? "text-amber-700 dark:text-amber-300"
        : block.tone === "info"
          ? "text-sky-700 dark:text-sky-300"
          : "text-foreground/75";

  return (
    <div className={toneClasses}>
      <div className="flex items-start gap-2">
        {block.tone === "error" ? (
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
        ) : block.tone === "warn" ? (
          <TerminalSquare className="mt-0.5 size-3.5 shrink-0" />
        ) : (
          <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-current/50" />
        )}
        <div className="min-w-0 flex-1">
          {block.label === "result" && block.tone !== "error" ? (
            <MarkdownBody
              className={cn(
                "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0 text-sky-700 dark:text-sky-300",
                compact ? "text-[11px] leading-5" : "text-xs leading-5",
              )}
            >
              {block.text}
            </MarkdownBody>
          ) : (
            <div className={cn("whitespace-pre-wrap break-words", compact ? "text-[11px]" : "text-xs")}>
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
                {block.label}
              </span>
              {block.text ? <span className="ml-2">{block.text}</span> : null}
            </div>
          )}
          {block.detail && (
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] text-foreground/75">
              {block.detail}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

function TranscriptDiffGroup({
  block,
  density,
}: {
  block: Extract<TranscriptBlock, { type: "diff_group" }>;
  density: TranscriptDensity;
}) {
  const [open, setOpen] = useState(false);
  const compact = density === "compact";

  // Count add/remove lines (exclude context, hunk, file_header, truncation)
  const addCount = block.hunks.filter((h) => h.changeType === "add").length;
  const removeCount = block.hunks.filter((h) => h.changeType === "remove").length;
  const hasChanges = addCount > 0 || removeCount > 0;

  // Extract a short file name from the path
  const shortFile = block.filePath
    ? block.filePath.split("/").pop() ?? block.filePath
    : "diff";

  return (
    <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.04] p-2">
      <button
        type="button"
        className="flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left text-inherit"
        onClick={() => setOpen((v) => !v)}
      >
        <GitCompare className={compact ? "size-3.5" : "size-4"} />
        <span className={cn("text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700 dark:text-blue-300")}>
          {shortFile}
        </span>
        {hasChanges && (
          <span className="text-[10px] tabular-nums">
            <span className="text-emerald-600 dark:text-emerald-400">+{addCount}</span>
            {" "}
            <span className="text-red-600 dark:text-red-400">-{removeCount}</span>
          </span>
        )}
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
      </button>
      {open && (
        <pre className={cn(
          "mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono pl-5",
          compact ? "text-[11px]" : "text-xs",
        )}>
          {block.hunks.map((hunk, i) => {
            const key = `${i}-${hunk.changeType}`;
            switch (hunk.changeType) {
              case "remove":
                return (
                  <span key={key} className="block bg-red-500/[0.10] text-red-700 dark:text-red-300 -mx-2 px-2">
                    <span className="select-none mr-2 text-red-500/60 dark:text-red-400/50">-</span>
                    {hunk.text}
                    {"\n"}
                  </span>
                );
              case "add":
                return (
                  <span key={key} className="block bg-emerald-500/[0.10] text-emerald-700 dark:text-emerald-300 -mx-2 px-2">
                    <span className="select-none mr-2 text-emerald-500/60 dark:text-emerald-400/50">+</span>
                    {hunk.text}
                    {"\n"}
                  </span>
                );
              case "file_header":
                return (
                  <span key={key} className="block font-semibold text-blue-600 dark:text-blue-300 mt-2 first:mt-0">
                    {hunk.text}
                    {"\n"}
                  </span>
                );
              case "truncation":
                return (
                  <span key={key} className="block text-muted-foreground italic mt-1">
                    {hunk.text}
                    {"\n"}
                  </span>
                );
              case "context":
              default:
                return (
                  <span key={key} className="block text-muted-foreground/70">
                    {" "}
                    {hunk.text}
                    {"\n"}
                  </span>
                );
            }
          })}
        </pre>
      )}
    </div>
  );
}

function TranscriptStderrGroup({
  block,
  density,
}: {
  block: Extract<TranscriptBlock, { type: "stderr_group" }>;
  density: TranscriptDensity;
}) {
  const [open, setOpen] = useState(false);
  const compact = density === "compact";
  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-2 text-amber-700 dark:text-amber-300">
      <button
        type="button"
        className="flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left text-inherit"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={cn("text-[10px] font-semibold uppercase tracking-[0.14em]")}>
          {block.lines.length} log {block.lines.length === 1 ? "line" : "lines"}
        </span>
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
      </button>
      {open && (
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] text-amber-700/80 dark:text-amber-300/80 pl-5">
          {block.lines.map((line, i) => (
            <span key={`${line.ts}-${i}`}>
              <span className="select-none text-amber-500/50 dark:text-amber-400/40">{i > 0 ? "\n" : ""}</span>
              {line.text}
            </span>
          ))}
        </pre>
      )}
    </div>
  );
}

function TranscriptSystemGroup({
  block,
  density,
}: {
  block: Extract<TranscriptBlock, { type: "system_group" }>;
  density: TranscriptDensity;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.04] p-2 text-blue-700 dark:text-blue-300">
      <button
        type="button"
        className="flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left text-inherit"
        onClick={() => setOpen((v) => !v)}
      >
        <TerminalSquare className="size-3.5 shrink-0" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">
          {block.lines.length} system {block.lines.length === 1 ? "message" : "messages"}
        </span>
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
      </button>
      {open && (
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] text-blue-700/80 dark:text-blue-300/80 pl-5">
          {block.lines.map((line, i) => (
            <span key={`${line.ts}-${i}`}>
              <span className="select-none text-blue-500/40 dark:text-blue-400/30">{i > 0 ? "\n" : ""}</span>
              {line.text}
            </span>
          ))}
        </pre>
      )}
    </div>
  );
}

function TranscriptStdoutRow({
  block,
  density,
  collapseByDefault,
}: {
  block: Extract<TranscriptBlock, { type: "stdout" }>;
  density: TranscriptDensity;
  collapseByDefault: boolean;
}) {
  const [open, setOpen] = useState(!collapseByDefault);

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          stdout
        </span>
        <button
          type="button"
          className="inline-flex size-5 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => setOpen((value) => !value)}
          aria-label={open ? "Collapse stdout" : "Expand stdout"}
        >
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
      </div>
      {open && (
        <pre className={cn(
          "mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono text-foreground/80",
          density === "compact" ? "text-[11px]" : "text-xs",
        )}>
          {block.text}
        </pre>
      )}
    </div>
  );
}

function findScrollParent(element: HTMLElement): HTMLElement | Window {
  let current = element.parentElement;
  while (current) {
    const style = window.getComputedStyle(current);
    if (/(auto|scroll)/.test(style.overflowY) && current.scrollHeight > current.clientHeight) {
      return current;
    }
    current = current.parentElement;
  }
  return window;
}

function rawEntryContent(entry: TranscriptEntry): string {
  if (entry.kind === "tool_call") {
    return `${entry.name}\n${formatToolPayload(entry.input)}`;
  }
  if (entry.kind === "tool_result") {
    return formatToolPayload(entry.content);
  }
  if (entry.kind === "result") {
    return `${entry.text}\n${formatTokens(entry.inputTokens)} / ${formatTokens(entry.outputTokens)} / $${entry.costUsd.toFixed(6)}`;
  }
  if (entry.kind === "init") {
    return `model=${entry.model}${entry.sessionId ? ` session=${entry.sessionId}` : ""}`;
  }
  return entry.text;
}

function RawTranscriptView({
  entries,
  density,
}: {
  entries: TranscriptEntry[];
  density: TranscriptDensity;
}) {
  const compact = density === "compact";
  const listRef = useRef<HTMLDivElement | null>(null);
  const shouldVirtualize = entries.length > RAW_VIRTUALIZATION_THRESHOLD;
  const [range, setRange] = useState(() => ({
    start: 0,
    end: Math.min(entries.length, shouldVirtualize ? RAW_INITIAL_ROWS : entries.length),
  }));

  useEffect(() => {
    if (!shouldVirtualize) {
      setRange({ start: 0, end: entries.length });
      return;
    }

    const list = listRef.current;
    if (!list) return;

    const scrollParent = findScrollParent(list);
    const updateRange = () => {
      const scrollElement: HTMLElement | null = scrollParent === window ? null : (scrollParent as HTMLElement);
      const scrollerTop = scrollElement ? scrollElement.getBoundingClientRect().top : 0;
      const scrollerHeight = scrollElement ? scrollElement.clientHeight : window.innerHeight;
      const listTop = list.getBoundingClientRect().top;
      const visibleTop = Math.max(0, scrollerTop - listTop);
      const visibleBottom = Math.max(visibleTop + scrollerHeight, 0);
      const nextStart = Math.max(0, Math.floor(visibleTop / RAW_ESTIMATED_ROW_HEIGHT) - RAW_OVERSCAN_ROWS);
      const nextEnd = Math.min(
        entries.length,
        Math.ceil(visibleBottom / RAW_ESTIMATED_ROW_HEIGHT) + RAW_OVERSCAN_ROWS,
      );
      setRange((current) => (
        current.start === nextStart && current.end === nextEnd
          ? current
          : { start: nextStart, end: nextEnd }
      ));
    };

    updateRange();
    const frame = window.requestAnimationFrame(updateRange);
    scrollParent.addEventListener("scroll", updateRange, { passive: true });
    window.addEventListener("resize", updateRange);
    return () => {
      window.cancelAnimationFrame(frame);
      scrollParent.removeEventListener("scroll", updateRange);
      window.removeEventListener("resize", updateRange);
    };
  }, [entries.length, shouldVirtualize]);

  const visibleEntries = shouldVirtualize ? entries.slice(range.start, range.end) : entries;
  const topSpacer = shouldVirtualize ? range.start * RAW_ESTIMATED_ROW_HEIGHT : 0;
  const bottomSpacer = shouldVirtualize ? Math.max(0, entries.length - range.end) * RAW_ESTIMATED_ROW_HEIGHT : 0;

  return (
    <div ref={listRef} className={cn("font-mono", compact ? "space-y-1 text-[11px]" : "space-y-1.5 text-xs")}>
      {topSpacer > 0 && <div aria-hidden="true" style={{ height: topSpacer }} />}
      {visibleEntries.map((entry, idx) => (
        <div
          key={`${entry.kind}-${entry.ts}-${range.start + idx}`}
          className={cn(
            "grid gap-x-3",
            "grid-cols-[auto_1fr]",
          )}
        >
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {entry.kind}
          </span>
          <pre className="min-w-0 whitespace-pre-wrap break-words text-foreground/80">
            {rawEntryContent(entry)}
          </pre>
        </div>
      ))}
      {bottomSpacer > 0 && <div aria-hidden="true" style={{ height: bottomSpacer }} />}
    </div>
  );
}

export function RunTranscriptView({
  entries,
  mode = "nice",
  density = "comfortable",
  limit,
  streaming = false,
  collapseStdout = false,
  emptyMessage = "No transcript yet.",
  className,
  thinkingClassName,
}: RunTranscriptViewProps) {
  const blocks = useMemo(
    () => (mode === "raw" ? [] : normalizeTranscript(entries, streaming)),
    [entries, mode, streaming],
  );
  const visibleBlocks = limit ? blocks.slice(-limit) : blocks;
  const visibleEntries = limit ? entries.slice(-limit) : entries;

  if (entries.length === 0) {
    return (
      <div className={cn("rounded-2xl border border-dashed border-border/70 bg-background/40 p-4 text-sm text-muted-foreground", className)}>
        {emptyMessage}
      </div>
    );
  }

  if (mode === "raw") {
    return (
      <div className={className}>
        <RawTranscriptView entries={visibleEntries} density={density} />
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {visibleBlocks.map((block, index) => (
        <div
          key={`${block.type}-${block.ts}-${index}`}
          className={cn(index === visibleBlocks.length - 1 && streaming && "animate-in fade-in slide-in-from-bottom-1 duration-300")}
        >
          {block.type === "message" && <TranscriptMessageBlock block={block} density={density} />}
          {block.type === "thinking" && (
            <TranscriptThinkingBlock block={block} density={density} className={thinkingClassName} />
          )}
          {block.type === "tool" && <TranscriptToolCard block={block} density={density} />}
          {block.type === "command_group" && <TranscriptCommandGroup block={block} density={density} />}
          {block.type === "tool_group" && <TranscriptToolGroup block={block} density={density} />}
          {block.type === "diff_group" && <TranscriptDiffGroup block={block} density={density} />}
          {block.type === "stderr_group" && <TranscriptStderrGroup block={block} density={density} />}
          {block.type === "system_group" && <TranscriptSystemGroup block={block} density={density} />}
          {block.type === "stdout" && (
            <TranscriptStdoutRow block={block} density={density} collapseByDefault={collapseStdout} />
          )}
          {block.type === "activity" && <TranscriptActivityRow block={block} density={density} />}
          {block.type === "event" && <TranscriptEventRow block={block} density={density} />}
        </div>
      ))}
    </div>
  );
}
