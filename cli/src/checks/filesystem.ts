import fs from "node:fs";

export function ensureWritableDirectory(path: string): string | null {
  try {
    if (!fs.existsSync(path)) {
      fs.mkdirSync(path, { recursive: true });
    }
    const stat = fs.statSync(path);
    if (!stat.isDirectory()) {
      return `${path} exists but is not a directory`;
    }
    fs.accessSync(path, fs.constants.W_OK);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
