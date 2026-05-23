import fs from "node:fs";
import path from "node:path";
import { resolvePaperclipInstanceRoot } from "./home-paths.js";

export type DatabaseRuntimeState = {
  mode: "embedded-postgres";
  connectionString: string;
  pid: number;
  embeddedPostgresDataDir: string;
  embeddedPostgresPort: number;
  updatedAt: string;
};

export function resolveDatabaseRuntimeStatePath(): string {
  return path.resolve(resolvePaperclipInstanceRoot(), "data", "runtime", "database.json");
}

export function writeDatabaseRuntimeState(
  state: DatabaseRuntimeState,
  statePath = resolveDatabaseRuntimeStatePath(),
): void {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const tmpPath = `${statePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmpPath, statePath);
}

export function readDatabaseRuntimeState(
  statePath = resolveDatabaseRuntimeStatePath(),
): DatabaseRuntimeState | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8")) as Partial<DatabaseRuntimeState>;
    if (
      parsed.mode !== "embedded-postgres" ||
      typeof parsed.connectionString !== "string" ||
      typeof parsed.pid !== "number" ||
      typeof parsed.embeddedPostgresDataDir !== "string" ||
      typeof parsed.embeddedPostgresPort !== "number" ||
      typeof parsed.updatedAt !== "string"
    ) {
      return null;
    }
    return parsed as DatabaseRuntimeState;
  } catch {
    return null;
  }
}

export function clearDatabaseRuntimeState(statePath = resolveDatabaseRuntimeStatePath()): void {
  try {
    fs.unlinkSync(statePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

export function isProcessRunning(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
