import { inflateRawSync } from "node:zlib";
import path from "node:path";
import type { CompanyPortabilityFileEntry } from "@paperclipai/shared";

const textDecoder = new TextDecoder();
const MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
const MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES = 250 * 1024 * 1024;

const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let crc = i;
  for (let bit = 0; bit < 8; bit++) {
    crc = (crc & 1) === 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  crcTable[i] = crc >>> 0;
}

export const binaryContentTypeByExtension: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function normalizeArchivePath(pathValue: string, options: { allowEmpty?: boolean } = {}) {
  const slashNormalized = pathValue.replace(/\\/g, "/");
  if (slashNormalized.startsWith("/") || /^[A-Za-z]:\//.test(slashNormalized)) {
    throw new Error(`Invalid zip archive: unsafe absolute entry path "${pathValue}".`);
  }
  const segments = slashNormalized.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error(`Invalid zip archive: unsafe relative entry path "${pathValue}".`);
  }
  const normalized = segments.join("/");
  if (!normalized && !options.allowEmpty) {
    throw new Error("Invalid zip archive: empty file entry path.");
  }
  return normalized;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff]!;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function readUint16(source: Uint8Array, offset: number) {
  return source[offset]! | (source[offset + 1]! << 8);
}

function readUint32(source: Uint8Array, offset: number) {
  return (
    source[offset]! |
    (source[offset + 1]! << 8) |
    (source[offset + 2]! << 16) |
    (source[offset + 3]! << 24)
  ) >>> 0;
}

function sharedArchiveRoot(paths: string[]) {
  if (paths.length === 0) return null;
  const firstSegments = paths
    .map((entry) => normalizeArchivePath(entry).split("/").filter(Boolean))
    .filter((parts) => parts.length > 0);
  if (firstSegments.length === 0) return null;
  const candidate = firstSegments[0]![0]!;
  return firstSegments.every((parts) => parts.length > 1 && parts[0] === candidate)
    ? candidate
    : null;
}

function bytesToPortableFileEntry(pathValue: string, bytes: Uint8Array): CompanyPortabilityFileEntry {
  const contentType = binaryContentTypeByExtension[path.extname(pathValue).toLowerCase()];
  if (!contentType) return textDecoder.decode(bytes);
  return {
    encoding: "base64",
    data: Buffer.from(bytes).toString("base64"),
    contentType,
  };
}

async function inflateZipEntry(compressionMethod: number, bytes: Uint8Array) {
  if (compressionMethod === 0) return bytes;
  if (compressionMethod !== 8) {
    throw new Error("Unsupported zip archive: only STORE and DEFLATE entries are supported.");
  }
  return new Uint8Array(inflateRawSync(bytes));
}

export async function readZipArchive(source: ArrayBuffer | Uint8Array): Promise<{
  rootPath: string | null;
  files: Record<string, CompanyPortabilityFileEntry>;
}> {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  const entries: Array<{ path: string; body: CompanyPortabilityFileEntry }> = [];
  let totalUncompressedSize = 0;
  let offset = 0;

  while (offset + 4 <= bytes.length) {
    const signature = readUint32(bytes, offset);
    if (signature === 0x02014b50 || signature === 0x06054b50) break;
    if (signature !== 0x04034b50) {
      throw new Error("Invalid zip archive: unsupported local file header.");
    }

    if (offset + 30 > bytes.length) {
      throw new Error("Invalid zip archive: truncated local file header.");
    }

    const generalPurposeFlag = readUint16(bytes, offset + 6);
    const compressionMethod = readUint16(bytes, offset + 8);
    const expectedChecksum = readUint32(bytes, offset + 14);
    const compressedSize = readUint32(bytes, offset + 18);
    const uncompressedSize = readUint32(bytes, offset + 22);
    const fileNameLength = readUint16(bytes, offset + 26);
    const extraFieldLength = readUint16(bytes, offset + 28);

    if ((generalPurposeFlag & 0x0008) !== 0) {
      throw new Error("Unsupported zip archive: data descriptors are not supported.");
    }

    const nameOffset = offset + 30;
    const bodyOffset = nameOffset + fileNameLength + extraFieldLength;
    const bodyEnd = bodyOffset + compressedSize;
    if (bodyEnd > bytes.length) {
      throw new Error("Invalid zip archive: truncated file contents.");
    }

    const rawArchivePath = textDecoder.decode(bytes.slice(nameOffset, nameOffset + fileNameLength));
    const isDirectoryEntry = /\/$/.test(rawArchivePath.replace(/\\/g, "/"));
    const archivePath = normalizeArchivePath(rawArchivePath, { allowEmpty: isDirectoryEntry });
    if (archivePath && !isDirectoryEntry) {
      if (uncompressedSize > MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES) {
        throw new Error(`Invalid zip archive: entry "${archivePath}" exceeds the maximum uncompressed size.`);
      }
      totalUncompressedSize += uncompressedSize;
      if (totalUncompressedSize > MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES) {
        throw new Error("Invalid zip archive: total uncompressed size exceeds the maximum allowed size.");
      }
      const entryBytes = await inflateZipEntry(compressionMethod, bytes.slice(bodyOffset, bodyEnd));
      if (entryBytes.length !== uncompressedSize) {
        throw new Error(`Invalid zip archive: entry size mismatch for "${archivePath}".`);
      }
      if (crc32(entryBytes) !== expectedChecksum) {
        throw new Error(`Invalid zip archive: checksum mismatch for "${archivePath}".`);
      }
      entries.push({
        path: archivePath,
        body: bytesToPortableFileEntry(archivePath, entryBytes),
      });
    }

    offset = bodyEnd;
  }

  const rootPath = sharedArchiveRoot(entries.map((entry) => entry.path));
  const files: Record<string, CompanyPortabilityFileEntry> = {};
  for (const entry of entries) {
    const normalizedPath =
      rootPath && entry.path.startsWith(`${rootPath}/`)
        ? entry.path.slice(rootPath.length + 1)
        : entry.path;
    if (!normalizedPath) continue;
    files[normalizedPath] = entry.body;
  }

  return { rootPath, files };
}
