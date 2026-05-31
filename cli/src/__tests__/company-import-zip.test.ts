import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveInlineSourceFromPath } from "../commands/client/company.js";
import { readZipArchive } from "../commands/client/zip.js";
import { createStoredZipArchive } from "./helpers/zip.js";

const tempDirs: string[] = [];

function writeUint32(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe("resolveInlineSourceFromPath", () => {
  it("imports portable files from a zip archive instead of scanning the parent directory", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "paperclip-company-import-zip-"));
    tempDirs.push(tempDir);

    const archivePath = path.join(tempDir, "paperclip-demo.zip");
    const archive = createStoredZipArchive(
      {
        "COMPANY.md": "# Company\n",
        ".paperclip.yaml": "schema: paperclip/v1\n",
        "agents/ceo/AGENT.md": "# CEO\n",
        "notes/todo.txt": "ignore me\n",
      },
      "paperclip-demo",
    );
    await writeFile(archivePath, archive);

    const resolved = await resolveInlineSourceFromPath(archivePath);

    expect(resolved).toEqual({
      rootPath: "paperclip-demo",
      files: {
        "COMPANY.md": "# Company\n",
        ".paperclip.yaml": "schema: paperclip/v1\n",
        "agents/ceo/AGENT.md": "# CEO\n",
      },
    });
  });

  it("rejects zip archives with traversal entry paths", async () => {
    const archive = createStoredZipArchive(
      {
        "../outside.txt": "nope\n",
      },
      "paperclip-demo",
    );

    await expect(readZipArchive(archive)).rejects.toThrow("unsafe relative entry path");
  });

  it("rejects zip archives with invalid entry checksums", async () => {
    const archive = createStoredZipArchive(
      {
        "COMPANY.md": "# Company\n",
      },
      "paperclip-demo",
    );
    writeUint32(archive, 14, 0);

    await expect(readZipArchive(archive)).rejects.toThrow("checksum mismatch");
  });
});
