import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { Db } from "@paperclipai/db";

interface TimeWindow {
  label: string;
  usedPercent: number;
  resetsAt: string | null;
}

interface ProviderUsage {
  provider: string;
  plan: string;
  isMock: boolean;
  error?: string;
  windows: TimeWindow[];
}

function readClaudeToken(): string | null {
  try {
    const raw = fs.readFileSync(path.join(os.homedir(), ".claude", ".credentials.json"), "utf8");
    const json = JSON.parse(raw) as Record<string, unknown>;
    const oauth = json?.claudeAiOauth as Record<string, unknown> | undefined;
    const token = oauth?.accessToken;
    return typeof token === "string" && token ? token : null;
  } catch {
    return null;
  }
}

function readCodexCreds(): { token: string; accountId: string | null } | null {
  try {
    const codexHome = (process.env.CODEX_HOME ?? "").trim();
    const root = codexHome || path.join(os.homedir(), ".codex");
    const raw = fs.readFileSync(path.join(root, "auth.json"), "utf8");
    const json = JSON.parse(raw) as Record<string, unknown>;

    const apiKey = json?.OPENAI_API_KEY;
    if (typeof apiKey === "string" && apiKey.trim()) {
      return { token: apiKey.trim(), accountId: null };
    }

    const tokens = json?.tokens as Record<string, unknown> | undefined;
    const accessToken = tokens?.access_token ?? tokens?.accessToken;
    if (typeof accessToken === "string" && accessToken) {
      const accountId = tokens?.account_id ?? tokens?.accountId;
      return { token: accessToken, accountId: typeof accountId === "string" ? accountId : null };
    }
    return null;
  } catch {
    return null;
  }
}

function windowLabelFromSeconds(seconds: number): string {
  if (seconds <= 5 * 60 * 60) return "5-hour session";
  if (seconds <= 24 * 60 * 60) return "Daily";
  if (seconds <= 7 * 24 * 60 * 60) return "Weekly";
  return "Monthly";
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, " ");
}

async function fetchClaudeUsage(): Promise<ProviderUsage> {
  const mockResult = (error?: string): ProviderUsage => ({
    provider: "claude",
    plan: "Pro",
    isMock: true,
    error,
    windows: [
      { label: "5-hour session", usedPercent: 42, resetsAt: null },
      { label: "7-day", usedPercent: 28, resetsAt: null },
    ],
  });

  const token = readClaudeToken();
  if (!token) return mockResult("No credentials found — run `claude` to authenticate.");

  try {
    const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-beta": "oauth-2025-04-20",
        Accept: "application/json",
        "User-Agent": "claude-code/2.1.0",
      },
      signal: AbortSignal.timeout(10_000),
    });

    // A 429 means the session/weekly limit is hit. The response body still
    // contains the usage shape, so parse it instead of falling back to mock.
    if (!res.ok && res.status !== 429) throw new Error(`HTTP ${res.status}`);

    let data: Record<string, { utilization?: number; resets_at?: string } | null> = {};
    try {
      data = (await res.json()) as typeof data;
    } catch {
      if (res.status === 429) {
        // Body wasn't JSON — surface a real limited state rather than mock.
        return {
          provider: "claude",
          plan: "Pro",
          isMock: false,
          error: "Rate limit reached",
          windows: [
            { label: "5-hour session", usedPercent: 100, resetsAt: null },
            { label: "7-day", usedPercent: 100, resetsAt: null },
          ],
        };
      }
      throw new Error(`HTTP ${res.status}`);
    }

    const windows: TimeWindow[] = [];

    const five = data.five_hour;
    if (five) {
      windows.push({
        label: "5-hour session",
        usedPercent: Math.round(five.utilization ?? 0),
        resetsAt: five.resets_at ?? null,
      });
    }

    const seven = data.seven_day;
    if (seven) {
      windows.push({
        label: "7-day",
        usedPercent: Math.round(seven.utilization ?? 0),
        resetsAt: seven.resets_at ?? null,
      });
    }

    if (windows.length === 0) windows.push({ label: "Usage", usedPercent: 0, resetsAt: null });

    return { provider: "claude", plan: "Pro", isMock: false, windows };
  } catch (err) {
    return mockResult(err instanceof Error ? err.message : "Unknown error");
  }
}

async function fetchCodexUsage(): Promise<ProviderUsage> {
  const mockResult = (error?: string): ProviderUsage => ({
    provider: "codex",
    plan: "Plus",
    isMock: true,
    error,
    windows: [{ label: "Weekly", usedPercent: 18, resetsAt: null }],
  });

  const creds = readCodexCreds();
  if (!creds) return mockResult("No credentials found — run `codex` to authenticate.");

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${creds.token}`,
      "User-Agent": "CodexBar",
      Accept: "application/json",
    };
    if (creds.accountId) headers["ChatGPT-Account-Id"] = creds.accountId;

    const res = await fetch("https://chatgpt.com/backend-api/wham/usage", {
      headers,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = (await res.json()) as {
      plan_type?: string;
      rate_limit?: {
        primary_window?: { used_percent: number; reset_at: number; limit_window_seconds: number };
        secondary_window?: { used_percent: number; reset_at: number; limit_window_seconds: number };
      };
    };

    const plan = data.plan_type ? capitalize(data.plan_type) : "Plus";
    const windows: TimeWindow[] = [];

    const pw = data.rate_limit?.primary_window;
    if (pw) {
      windows.push({
        label: windowLabelFromSeconds(pw.limit_window_seconds),
        usedPercent: pw.used_percent,
        resetsAt: pw.reset_at ? new Date(pw.reset_at * 1000).toISOString() : null,
      });
    }

    const sw = data.rate_limit?.secondary_window;
    if (sw) {
      windows.push({
        label: `Secondary (${windowLabelFromSeconds(sw.limit_window_seconds)})`,
        usedPercent: sw.used_percent,
        resetsAt: sw.reset_at ? new Date(sw.reset_at * 1000).toISOString() : null,
      });
    }

    if (windows.length === 0) windows.push({ label: "Usage", usedPercent: 0, resetsAt: null });

    return { provider: "codex", plan, isMock: false, windows };
  } catch (err) {
    return mockResult(err instanceof Error ? err.message : "Unknown error");
  }
}

export function usageRoutes(_db: Db) {
  const router = Router();

  router.get("/usage", async (_req, res) => {
    const [claude, codex] = await Promise.all([fetchClaudeUsage(), fetchCodexUsage()]);
    res.json({ providers: [claude, codex] });
  });

  return router;
}
