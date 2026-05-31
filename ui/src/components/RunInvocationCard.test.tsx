// @vitest-environment node

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { WorkspaceOperation } from "@paperclipai/shared";
import { ThemeProvider } from "../context/ThemeContext";
import { RunInvocationCard, WorkspaceOperationsSection } from "../pages/AgentDetail";

describe("RunInvocationCard", () => {
  it("keeps verbose invocation details collapsed by default", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <RunInvocationCard
          payload={{
            adapterType: "claude_local",
            cwd: "/tmp/workspace",
            command: "claude",
            commandArgs: ["--dangerously-skip-permissions"],
            commandNotes: ["Prompt is piped to claude via stdin."],
            prompt: "very long prompt body",
            context: { triggeredBy: "board" },
            env: { ANTHROPIC_API_KEY: "***REDACTED***" },
          }}
          censorUsernameInLogs={false}
        />
      </ThemeProvider>,
    );

    expect(html).toContain("Invocation");
    expect(html).toContain("Adapter:");
    expect(html).toContain("Working dir:");
    expect(html).toContain("Details");
    expect(html).not.toContain("Command:");
    expect(html).not.toContain("Prompt is piped to claude via stdin.");
    expect(html).not.toContain("very long prompt body");
    expect(html).not.toContain("ANTHROPIC_API_KEY");
    expect(html).not.toContain("triggeredBy");
  });

  it("redacts workspace operation commands and paths before rendering", () => {
    const operation: WorkspaceOperation = {
      id: "operation-1",
      companyId: "company-1",
      executionWorkspaceId: "workspace-1",
      heartbeatRunId: "run-1",
      phase: "workspace_provision",
      command: "API_KEY=secret-value /home/alice/bin/provision",
      cwd: "/home/alice/project",
      status: "succeeded",
      exitCode: 0,
      logStore: null,
      logRef: null,
      logBytes: null,
      logSha256: null,
      logCompressed: false,
      stdoutExcerpt: null,
      stderrExcerpt: null,
      metadata: {
        worktreePath: "/home/alice/project/.worktrees/run-1",
        repoRoot: "/home/alice/project",
      },
      startedAt: new Date("2026-05-31T00:00:00Z"),
      finishedAt: new Date("2026-05-31T00:01:00Z"),
      createdAt: new Date("2026-05-31T00:00:00Z"),
      updatedAt: new Date("2026-05-31T00:01:00Z"),
    };

    const html = renderToStaticMarkup(
      <ThemeProvider>
        <WorkspaceOperationsSection operations={[operation]} censorUsernameInLogs={true} />
      </ThemeProvider>,
    );

    expect(html).toContain("***REDACTED***");
    expect(html).not.toContain("secret-value");
    expect(html).not.toContain("alice");
  });
});
