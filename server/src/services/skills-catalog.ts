import { existsSync, readFileSync, statSync } from "node:fs";
import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  CatalogSkill,
  CatalogSkillFileDetail,
  CatalogSkillListQuery,
} from "@paperclipai/shared";
import { HttpError, conflict, notFound } from "../errors.js";
import { normalizePortablePath } from "./portable-path.js";

interface CatalogManifestFile {
  packageName: string;
  packageVersion: string;
  skills: CatalogSkill[];
}

const serviceDir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const repoRoot = path.resolve(serviceDir, "../../..");
const fallbackCatalogPackageRoot = path.join(repoRoot, "packages/skills-catalog");
const fallbackCatalogManifestPath = path.join(fallbackCatalogPackageRoot, "generated/catalog.json");
let cachedCatalogManifest: {
  manifest: CatalogManifestFile;
  path: string;
  mtimeMs: number;
  size: number;
} | null = null;

function resolveCatalogManifestPath(): string {
  const candidates: string[] = [];
  try {
    candidates.push(require.resolve("@paperclipai/skills-catalog/catalog.json"));
  } catch {
    // Monorepo dev and tests can still use the source-tree fallback below.
  }
  candidates.push(fallbackCatalogManifestPath);

  const manifestPath = candidates.find((candidate) => existsSync(candidate));
  if (!manifestPath) {
    throw new Error(
      `Skills catalog manifest not found. Checked: ${candidates.join(", ")}. Run pnpm --filter @paperclipai/skills-catalog build:manifest.`,
    );
  }
  return manifestPath;
}

function catalogPackageRootForManifest(manifestPath: string): string {
  const manifestDir = path.dirname(manifestPath);
  if (path.basename(manifestDir) !== "generated") return path.dirname(manifestPath);
  const generatedParent = path.dirname(manifestDir);
  if (path.basename(generatedParent) === "dist") return path.dirname(generatedParent);
  return generatedParent;
}

function loadCatalogManifest(): CatalogManifestFile {
  return JSON.parse(readFileSync(resolveCatalogManifestPath(), "utf8")) as CatalogManifestFile;
}

function getCatalogManifest() {
  const catalogManifestPath = resolveCatalogManifestPath();
  const stats = statSync(catalogManifestPath);
  if (
    cachedCatalogManifest &&
    cachedCatalogManifest.path === catalogManifestPath &&
    cachedCatalogManifest.mtimeMs === stats.mtimeMs &&
    cachedCatalogManifest.size === stats.size
  ) {
    return cachedCatalogManifest.manifest;
  }

  const manifest = loadCatalogManifest();
  cachedCatalogManifest = {
    manifest,
    path: catalogManifestPath,
    mtimeMs: stats.mtimeMs,
    size: stats.size,
  };
  return manifest;
}

function getCatalogSkills() {
  const catalogManifest = getCatalogManifest();
  return catalogManifest.skills.map((skill) => ({
    ...skill,
    packageName: catalogManifest.packageName,
    packageVersion: catalogManifest.packageVersion,
  }));
}

function isMarkdownPath(filePath: string) {
  const fileName = path.posix.basename(filePath).toLowerCase();
  return fileName === "skill.md" || fileName.endsWith(".md");
}

function inferLanguageFromPath(filePath: string) {
  const fileName = path.posix.basename(filePath).toLowerCase();
  if (fileName === "skill.md" || fileName.endsWith(".md")) return "markdown";
  if (fileName.endsWith(".ts")) return "typescript";
  if (fileName.endsWith(".tsx")) return "tsx";
  if (fileName.endsWith(".js")) return "javascript";
  if (fileName.endsWith(".jsx")) return "jsx";
  if (fileName.endsWith(".json")) return "json";
  if (fileName.endsWith(".yml") || fileName.endsWith(".yaml")) return "yaml";
  if (fileName.endsWith(".sh")) return "bash";
  if (fileName.endsWith(".py")) return "python";
  if (fileName.endsWith(".html")) return "html";
  if (fileName.endsWith(".css")) return "css";
  return null;
}

function resolveCatalogPackageRoot() {
  return catalogPackageRootForManifest(resolveCatalogManifestPath());
}

function searchText(skill: CatalogSkill) {
  return [
    skill.id,
    skill.key,
    skill.slug,
    skill.name,
    skill.description,
    skill.category,
    skill.kind,
    ...skill.recommendedForRoles,
    ...skill.tags,
  ].join("\n").toLowerCase();
}

export function listCatalogSkills(query: CatalogSkillListQuery = {}): CatalogSkill[] {
  const normalizedQuery = query.q?.trim().toLowerCase() ?? "";
  return getCatalogSkills()
    .filter((skill) => !query.kind || skill.kind === query.kind)
    .filter((skill) => !query.category || skill.category === query.category)
    .filter((skill) => !normalizedQuery || searchText(skill).includes(normalizedQuery))
    .sort((left, right) => left.name.localeCompare(right.name) || left.key.localeCompare(right.key));
}

export function resolveCatalogSkillReference(reference: string): { skill: CatalogSkill | null; ambiguous: boolean } {
  const trimmed = reference.trim();
  if (!trimmed) return { skill: null, ambiguous: false };
  const catalogSkills = getCatalogSkills();

  const exact = catalogSkills.find((skill) => skill.id === trimmed || skill.key === trimmed);
  if (exact) return { skill: exact, ambiguous: false };

  const slugMatches = catalogSkills.filter((skill) => skill.slug === trimmed);
  if (slugMatches.length === 1) return { skill: slugMatches[0]!, ambiguous: false };
  if (slugMatches.length > 1) return { skill: null, ambiguous: true };
  return { skill: null, ambiguous: false };
}

export function getCatalogSkillOrThrow(reference: string): CatalogSkill {
  const result = resolveCatalogSkillReference(reference);
  if (result.ambiguous) {
    throw conflict(`Catalog skill slug "${reference}" is ambiguous. Use an id or key.`);
  }
  if (!result.skill) {
    throw notFound("Catalog skill not found");
  }
  return result.skill;
}

export async function readCatalogSkillFile(
  reference: string,
  relativePath = "SKILL.md",
): Promise<CatalogSkillFileDetail> {
  const skill = getCatalogSkillOrThrow(reference);
  const normalizedPath = normalizePortablePath(relativePath || "SKILL.md");
  const fileEntry = skill.files.find((entry) => entry.path === normalizedPath);
  if (!fileEntry) {
    throw notFound("Catalog skill file not found");
  }

  const packageRoot = resolveCatalogPackageRoot();
  const absolutePath = path.resolve(packageRoot, skill.path, normalizedPath);
  const skillRoot = path.resolve(packageRoot, skill.path);
  if (absolutePath !== skillRoot && !absolutePath.startsWith(`${skillRoot}${path.sep}`)) {
    throw notFound("Catalog skill file not found");
  }

  if (fileEntry.kind === "asset") {
    throw new HttpError(415, "Catalog asset previews are not supported.");
  }

  const content = await fs.readFile(absolutePath, "utf8");
  return {
    catalogSkillId: skill.id,
    path: normalizedPath,
    kind: fileEntry.kind,
    content,
    language: inferLanguageFromPath(normalizedPath),
    markdown: isMarkdownPath(normalizedPath),
  };
}

export async function copyCatalogSkillFile(reference: string, relativePath: string, targetPath: string): Promise<void> {
  const skill = getCatalogSkillOrThrow(reference);
  const normalizedPath = normalizePortablePath(relativePath || "SKILL.md");
  const fileEntry = skill.files.find((entry) => entry.path === normalizedPath);
  if (!fileEntry) {
    throw notFound("Catalog skill file not found");
  }

  const packageRoot = resolveCatalogPackageRoot();
  const absolutePath = path.resolve(packageRoot, skill.path, normalizedPath);
  const skillRoot = path.resolve(packageRoot, skill.path);
  if (absolutePath !== skillRoot && !absolutePath.startsWith(`${skillRoot}${path.sep}`)) {
    throw notFound("Catalog skill file not found");
  }

  await fs.copyFile(absolutePath, targetPath);
}

export function getCatalogPackageMetadata() {
  const catalogManifest = getCatalogManifest();
  return {
    packageName: catalogManifest.packageName,
    packageVersion: catalogManifest.packageVersion,
  };
}
