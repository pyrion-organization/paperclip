import { randomUUID, randomBytes } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { TelemetryState } from "./types.js";

export function loadOrCreateState(stateDir: string, version: string): TelemetryState {
  const filePath = path.join(stateDir, "state.json");
  let existingStateWasInvalid = false;

  const readValidState = (): TelemetryState | null => {
    try {
      const raw = readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw) as TelemetryState;
      if (parsed.installId && parsed.salt) {
        return parsed;
      }
    } catch {
      // Missing or corrupted state file.
    }
    return null;
  };

  if (existsSync(filePath)) {
    const existing = readValidState();
    if (existing) return existing;
    existingStateWasInvalid = true;
  }

  const state: TelemetryState = {
    installId: randomUUID(),
    salt: randomBytes(32).toString("hex"),
    createdAt: new Date().toISOString(),
    firstSeenVersion: version,
  };

  mkdirSync(stateDir, { recursive: true });
  if (existingStateWasInvalid) {
    const tempPath = path.join(stateDir, `.state.${process.pid}.${randomUUID()}.tmp`);
    writeFileSync(tempPath, JSON.stringify(state, null, 2) + "\n", { encoding: "utf-8", flag: "wx" });
    renameSync(tempPath, filePath);
    return state;
  }

  let fd: number | null = null;
  try {
    fd = openSync(filePath, "wx");
    writeFileSync(fd, JSON.stringify(state, null, 2) + "\n", "utf-8");
    return state;
  } catch (err) {
    const code = err && typeof err === "object" ? (err as { code?: unknown }).code : null;
    if (code === "EEXIST") {
      const existing = readValidState();
      if (existing) return existing;
    }
    throw err;
  } finally {
    if (fd !== null) closeSync(fd);
  }
}
