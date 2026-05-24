import { describe, expect, it } from "vitest";
import { pluginManifestV1Schema } from "@paperclipai/shared";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import {
  EXPORT_NAMES,
  JOB_KEYS,
  PLUGIN_ID,
  TOOL_NAMES,
  WEBHOOK_KEYS,
} from "../src/constants.js";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import * as uiExports from "../src/ui/index.js";

describe("kitchen sink example plugin", () => {
  it("declares a valid manifest with matching UI exports", () => {
    expect(pluginManifestV1Schema.parse(manifest)).toMatchObject({
      id: PLUGIN_ID,
      tools: [
        expect.objectContaining({ name: TOOL_NAMES.echo }),
        expect.objectContaining({ name: TOOL_NAMES.companySummary }),
        expect.objectContaining({ name: TOOL_NAMES.createIssue }),
      ],
      jobs: [expect.objectContaining({ jobKey: JOB_KEYS.heartbeat })],
      webhooks: [expect.objectContaining({ endpointKey: WEBHOOK_KEYS.demo })],
    });

    const declaredExports = [
      ...(manifest.ui?.slots ?? []).map((slot) => slot.exportName),
      ...(manifest.ui?.launchers ?? []).map((launcher) => launcher.action.target),
    ];

    expect(new Set(declaredExports)).toEqual(new Set(Object.values(EXPORT_NAMES)));
    for (const exportName of declaredExports) {
      expect(uiExports).toHaveProperty(exportName);
      expect(typeof uiExports[exportName as keyof typeof uiExports]).toBe("function");
    }
  });

  it("smokes worker setup, data, actions, tools, jobs, events, and webhooks", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    await expect(plugin.definition.onHealth?.()).resolves.toMatchObject({ status: "ok" });
    await expect(harness.getData("plugin-config")).resolves.toMatchObject({
      showSidebarEntry: true,
      enableWorkspaceDemos: true,
    });

    await expect(harness.performAction("write-metric", { name: "smoke", value: 2 })).resolves.toMatchObject({
      ok: true,
      value: 2,
    });
    expect(harness.metrics).toContainEqual({
      name: "demo.smoke",
      value: 2,
      tags: { source: "manual" },
    });

    await expect(
      harness.executeTool(TOOL_NAMES.echo, { message: "hello" }, { companyId: "company-1", projectId: "project-1" }),
    ).resolves.toMatchObject({
      content: "hello",
      data: { message: "hello" },
    });

    await harness.runJob(JOB_KEYS.heartbeat, { runId: "job-run-1", trigger: "manual" });
    expect(harness.getState({ scopeKind: "instance", stateKey: "last-job-run" })).toMatchObject({
      jobKey: JOB_KEYS.heartbeat,
      runId: "job-run-1",
      trigger: "manual",
    });

    await harness.emit(`plugin.${PLUGIN_ID}.demo-event`, { message: "from test" }, { companyId: "company-1" });
    await plugin.definition.onWebhook?.({
      endpointKey: WEBHOOK_KEYS.demo,
      headers: {},
      rawBody: "{\"ok\":true}",
      parsedBody: { ok: true },
      requestId: "webhook-1",
    });
    expect(harness.getState({ scopeKind: "instance", stateKey: "last-webhook" })).toMatchObject({
      endpointKey: WEBHOOK_KEYS.demo,
      requestId: "webhook-1",
      parsedBody: { ok: true },
    });

    await expect(harness.getData("overview", { companyId: "company-1" })).resolves.toMatchObject({
      pluginId: PLUGIN_ID,
      manifest: {
        jobs: [expect.objectContaining({ jobKey: JOB_KEYS.heartbeat })],
        webhooks: [expect.objectContaining({ endpointKey: WEBHOOK_KEYS.demo })],
        tools: expect.arrayContaining([expect.objectContaining({ name: TOOL_NAMES.echo })]),
      },
      runtimeLaunchers: [expect.objectContaining({ id: "kitchen-sink-runtime-launcher" })],
      lastJob: expect.objectContaining({ runId: "job-run-1" }),
      lastWebhook: expect.objectContaining({ requestId: "webhook-1" }),
    });
  });

  it("attributes issues created by the agent tool to the invoking run", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    const issueCreateInputs: Parameters<typeof harness.ctx.issues.create>[0][] = [];
    const createIssue = harness.ctx.issues.create.bind(harness.ctx.issues);
    harness.ctx.issues.create = async (input) => {
      issueCreateInputs.push(input);
      return await createIssue(input);
    };

    await expect(
      harness.executeTool(
        TOOL_NAMES.createIssue,
        { title: "Tool-created issue", description: "Created from a test run" },
        {
          companyId: "company-1",
          projectId: "project-1",
          agentId: "agent-1",
          runId: "run-1",
        },
      ),
    ).resolves.toMatchObject({
      content: "Created issue Tool-created issue",
      data: {
        originRunId: "run-1",
      },
    });

    expect(issueCreateInputs).toHaveLength(1);
    expect(issueCreateInputs[0]).toMatchObject({
      companyId: "company-1",
      projectId: "project-1",
      title: "Tool-created issue",
      description: "Created from a test run",
      originRunId: "run-1",
      actor: {
        actorAgentId: "agent-1",
        actorRunId: "run-1",
      },
    });
  });
});
