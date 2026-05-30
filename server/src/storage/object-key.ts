import { badRequest } from "../errors.js";

export function normalizeStorageObjectKey(objectKey: string): string {
  const normalized = objectKey.replace(/\\/g, "/").trim();
  if (!normalized || normalized.startsWith("/")) {
    throw badRequest("Invalid object key");
  }

  const parts = normalized.split("/").filter((part) => part.length > 0);
  if (parts.length === 0 || parts.some((part) => part === "." || part === "..")) {
    throw badRequest("Invalid object key");
  }

  return parts.join("/");
}
