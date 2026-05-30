import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import type { StorageProvider, GetObjectResult, HeadObjectResult } from "./types.js";
import { notFound, badRequest } from "../errors.js";
import { normalizeStorageObjectKey } from "./object-key.js";

function resolveWithin(baseDir: string, objectKey: string): string {
  const normalizedKey = normalizeStorageObjectKey(objectKey);
  const resolved = path.resolve(baseDir, normalizedKey);
  const base = path.resolve(baseDir);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw badRequest("Invalid object key path");
  }
  return resolved;
}

async function statOrNull(filePath: string) {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;
  }
}

export function createLocalDiskStorageProvider(baseDir: string): StorageProvider {
  const root = path.resolve(baseDir);

  return {
    id: "local_disk",

    async putObject(input) {
      const targetPath = resolveWithin(root, input.objectKey);
      const dir = path.dirname(targetPath);
      await fs.mkdir(dir, { recursive: true });

      const tempPath = `${targetPath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await fs.writeFile(tempPath, input.body);
      await fs.rename(tempPath, targetPath);
    },

    async getObject(input): Promise<GetObjectResult> {
      const filePath = resolveWithin(root, input.objectKey);
      const stat = await statOrNull(filePath);
      if (!stat || !stat.isFile()) {
        throw notFound("Object not found");
      }
      return {
        stream: createReadStream(filePath),
        contentLength: stat.size,
        lastModified: stat.mtime,
      };
    },

    async headObject(input): Promise<HeadObjectResult> {
      const filePath = resolveWithin(root, input.objectKey);
      const stat = await statOrNull(filePath);
      if (!stat || !stat.isFile()) {
        return { exists: false };
      }
      return {
        exists: true,
        contentLength: stat.size,
        lastModified: stat.mtime,
      };
    },

    async deleteObject(input): Promise<void> {
      const filePath = resolveWithin(root, input.objectKey);
      try {
        await fs.unlink(filePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
      }
    },
  };
}
