import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { Db } from "@paperclipai/db";

const CLAUDE_CREDENTIALS_PATH = path.join(os.homedir(), ".claude", ".credentials.json");
const CLAUDE_OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const CLAUDE_TOKEN_ENDPOINT = "https://platform.claude.com/v1/oauth/token";

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

interface ClaudeCredentials {
  claudeAiOauth?: {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    scopes?: string[];
    subscriptionType?: string;
    rateLimitTier?: string;
  };
}

function readClaudeCredentials(): ClaudeCredentials | null {
  try {
    const raw = fs.readFileSync(CLAUDE_CREDENTIALS_PATH, "utf8");
    return JSON.parse(raw) as ClaudeCredentials;
  } catch {
    return null;
  }
}

async function refreshClaudeToken(refreshToken: string): Promise<string | null> {
  try {
    const res = await fetch(CLAUDE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: CLAUDE_OAUTH_CLIENT_ID,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };

    if (!data.access_token) return null;

    // Persist refreshed tokens back to disk so the CLI stays in sync
    const creds = readClaudeCredentials();
    if (creds?.claudeAiOauth) {
      creds.claudeAiOauth.accessToken = data.access_token;
      if (data.refresh_token) creds.claudeAiOauth.refreshToken = data.refresh_token;
      if (data.expires_in) {
        creds.claudeAiOauth.expiresAt = Date.now() + data.expires_in * 1000;
      }
      try {
        fs.writeFileSync(CLAUDE_CREDENTIALS_PATH, JSON.stringify(creds, null, 2), "utf8");
      } catch {
        // Non-fatal: we still have the new token in memory
      }
    }

    return data.access_token;
  } catch {
    return null;
  }
}

async function getClaudeToken(): Promise<{ token: string | null; error?: string }> {
  const creds = readClaudeCredentials();
  const oauth = creds?.claudeAiOauth;

  if (!oauth?.accessToken) {
    return { token: null, error: "No credentials found — run `claude` to authenticate." };
  }

  // Proactively refresh if the token is expired or within 60 seconds of expiry
  const isExpired = oauth.expiresAt != null && oauth.expiresAt - Date.now() < 60_000;
  if (isExpired && oauth.refreshToken) {
    const refreshed = await refreshClaudeToken(oauth.refreshToken);
    if (refreshed) return { token: refreshed };
    // Refresh failed — still try the existing token; it may work
  }

  return { token: oauth.accessToken };
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
      { label: "5-hour session", usedPercent: 0, resetsAt: null },
      { label: "7-day", usedPercent: 0, resetsAt: null },
    ],
  });

  const { token, error: credError } = await getClaudeToken();
  if (!token) return mockResult(credError);

  const fetchUsage = () =>
    fetch("https://api.anthropic.com/api/oauth/usage", {
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-beta": "oauth-2025-04-20",
        Accept: "application/json",
        "User-Agent": "claude-code/2.1.0",
      },
      signal: AbortSignal.timeout(10_000),
    });

  try {
    let res = await fetchUsage();

    // Retry once on 529 (transient overload) after a short delay
    if (res.status === 529) {
      await new Promise((r) => setTimeout(r, 2000));
      res = await fetchUsage();
    }

    if (res.status === 401) {
      // Token is expired and refresh either wasn't attempted or failed
      return mockResult("Session expired — run `claude` to re-authenticate.");
    }

    if (res.status === 529) {
      return mockResult("Anthropic API overloaded — try again shortly.");
    }

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
    windows: [{ label: "Weekly", usedPercent: 0, resetsAt: null }],
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
