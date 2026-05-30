import type { PaperclipConfig } from "../config/schema.js";
import type { CheckResult } from "./index.js";
import { ensureWritableDirectory } from "./filesystem.js";
import { resolveRuntimeLikePath } from "./path-resolver.js";

export function logCheck(config: PaperclipConfig, configPath?: string): CheckResult {
  const logDir = resolveRuntimeLikePath(config.logging.logDir, configPath);
  const reportedDir = logDir;

  const directoryProblem = ensureWritableDirectory(reportedDir);
  if (directoryProblem) {
    return {
      name: "Log directory",
      status: "fail",
      message: `Log directory is not writable: ${reportedDir}: ${directoryProblem}`,
      canRepair: false,
      repairHint: "Check file permissions on the log directory",
    };
  }

  return {
    name: "Log directory",
    status: "pass",
    message: `Log directory is writable: ${reportedDir}`,
  };
}
