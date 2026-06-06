import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AGENT_ICON_NAMES } from "@paperclipai/shared";

const mockAgentService = vi.hoisted(() => ({
  getById: vi.fn(),
}));

const mockListServerAdapters = vi.hoisted(() => vi.fn());

vi.mock("../services/agents.js", () => ({
  agentService: () => mockAgentService,
}));

vi.mock("../adapters/index.js", () => ({
  listServerAdapters: mockListServerAdapters,
}));

function registerModuleMocks() {
  vi.doMock("../services/agents.js", () => ({
    agentService: () => mockAgentService,
  }));

  vi.doMock("../adapters/index.js", () => ({
    listServerAdapters: mockListServerAdapters,
  }));
}

async function createApp(actor: Record<string, unknown>) {
  const [{ llmRoutes }, { errorHandler }] = await Promise.all([
    vi.importActual<typeof import("../routes/llms.js")>("../routes/llms.js"),
    vi.importActual<typeof import("../middleware/index.js")>("../middleware/index.js"),
  ]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  app.use("/api", llmRoutes({} as never));
  app.use(errorHandler);
  return app;
}

describe("llm routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("../routes/llms.js");
    vi.doUnmock("../middleware/index.js");
    registerModuleMocks();
    vi.clearAllMocks();
    mockListServerAdapters.mockReturnValue([
      { type: "codex_local", agentConfigurationDoc: "# codex_local agent configuration" },
    ]);
  });

  it("documents timer heartbeats as opt-in for new hires", async () => {
    const app = await createApp({
      type: "board",
      userId: "board-user",
      companyIds: ["company-1"],
      source: "local_implicit",
      isInstanceAdmin: true,
    });

    const res = await request(app).get("/api/llms/agent-configuration.txt");

    expect(res.status).toBe(200);
    expect(res.text).toContain("Use the paperclip-create-agent skill for end-to-end hiring");
    expect(res.text).toContain("desiredSkills");
    expect(res.text).toContain("sourceIssueId/sourceIssueIds");
    expect(res.text).toContain("Timer heartbeats are opt-in for new hires.");
    expect(res.text).toContain("Leave runtimeConfig.heartbeat.enabled false");
  });

  it("returns adapter configuration docs for known adapters", async () => {
    const app = await createApp({
      type: "board",
      userId: "board-user",
      companyIds: ["company-1"],
      source: "local_implicit",
      isInstanceAdmin: true,
    });

    const res = await request(app).get("/api/llms/agent-configuration/codex_local.txt");

    expect(res.status).toBe(200);
    expect(res.type).toMatch(/text\/plain/);
    expect(res.text).toBe("# codex_local agent configuration");
  });

  it("returns the agent icon catalog for board callers", async () => {
    const app = await createApp({
      type: "board",
      userId: "board-user",
      companyIds: ["company-1"],
      source: "local_implicit",
      isInstanceAdmin: true,
    });

    const res = await request(app).get("/api/llms/agent-icons.txt");

    expect(res.status).toBe(200);
    expect(res.type).toMatch(/text\/plain/);
    expect(res.text).toContain("# Paperclip Agent Icon Names");
    expect(res.text).toContain(`- ${AGENT_ICON_NAMES[0]}`);
  });

  it("rejects anonymous callers from the agent icon catalog", async () => {
    const app = await createApp({ type: "none", source: "none" });

    const res = await request(app).get("/api/llms/agent-icons.txt");

    expect(res.status).toBe(403);
    expect(mockAgentService.getById).not.toHaveBeenCalled();
  });

  it("rejects control characters in adapter configuration doc paths", async () => {
    const app = await createApp({
      type: "board",
      userId: "board-user",
      companyIds: ["company-1"],
      source: "local_implicit",
      isInstanceAdmin: true,
    });

    const res = await request(app).get("/api/llms/agent-configuration/codex_local%0AInjected:%20value.txt");

    expect(res.status).toBe(404);
    expect(res.text).toBe("Unknown adapter type");
    expect(res.text).not.toContain("Injected");
  });
});
