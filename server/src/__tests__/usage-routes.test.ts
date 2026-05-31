import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { errorHandler } from "../middleware/index.js";
import { usageRoutes } from "../routes/usage.js";

function createApp(actor: Record<string, unknown>) {
  const app = express();
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  app.use("/api", usageRoutes({} as any));
  app.use(errorHandler);
  return app;
}

describe("usageRoutes", () => {
  it("rejects non-board actors before reading provider credentials", async () => {
    await request(createApp({ type: "none" })).get("/api/usage").expect(403);
    await request(createApp({ type: "agent", companyId: "company-1", agentId: "agent-1" }))
      .get("/api/usage")
      .expect(403);
  });

  it("allows board actors to read usage metadata", async () => {
    const response = await request(createApp({ type: "board", source: "local_implicit" }))
      .get("/api/usage")
      .expect(200);

    expect(response.body.providers.map((provider: { provider: string }) => provider.provider)).toEqual([
      "claude",
      "codex",
    ]);
  });
});
