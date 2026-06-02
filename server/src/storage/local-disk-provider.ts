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

function isPathWithin(base: string, target: string): boolean {
  return target === base || target.startsWith(base + path.sep);
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

  async function realRoot() {
    await fs.mkdir(root, { recursive: true });
    return fs.realpath(root);
  }

  async function assertRealPathWithinRoot(targetPath: string) {
    const [base, realTarget] = await Promise.all([realRoot(), fs.realpath(targetPath)]);
    if (!isPathWithin(base, realTarget)) {
      throw badRequest("Invalid object key path");
    }
  }

  async function assertRealParentWithinRoot(targetPath: string) {
    const dir = path.dirname(targetPath);
    await fs.mkdir(dir, { recursive: true });
    const [base, realDir] = await Promise.all([realRoot(), fs.realpath(dir)]);
    if (!isPathWithin(base, realDir)) {
      throw badRequest("Invalid object key path");
    }
  }

  return {
    id: "local_disk",

    async putObject(input) {
      const targetPath = resolveWithin(root, input.objectKey);
      await assertRealParentWithinRoot(targetPath);

      const tempPath = `${targetPath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      try {
        await fs.writeFile(tempPath, input.body);
        await fs.rename(tempPath, targetPath);
      } catch (error) {
        await fs.unlink(tempPath).catch(() => undefined);
        throw error;
      }
    },

    async getObject(input): Promise<GetObjectResult> {
      const filePath = resolveWithin(root, input.objectKey);
      await assertRealPathWithinRoot(filePath).catch((error) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") throw notFound("Object not found");
        throw error;
      });
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
      try {
        await assertRealPathWithinRoot(filePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return { exists: false };
        }
        throw error;
      }
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
        await assertRealPathWithinRoot(filePath);
        await fs.unlink(filePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
      }
    },
  };
}
