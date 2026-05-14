import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { companies, createDb, projectWorkspaces, projects } from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { projectFilesService } from "../services/project-files.ts";

const execFileAsync = promisify(execFile);
const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres project files service tests: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

async function runGit(cwd: string, args: string[]) {
  return await execFileAsync("git", ["-C", cwd, ...args], { cwd });
}

async function createGitRepoWithOrigin() {
  const tempDirs: string[] = [];
  const localRepo = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-project-files-local-"));
  const originRepo = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-project-files-origin-"));
  tempDirs.push(localRepo, originRepo);

  await runGit(originRepo, ["init", "--bare"]);
  await runGit(localRepo, ["init"]);
  await runGit(localRepo, ["config", "user.name", "Paperclip Test"]);
  await runGit(localRepo, ["config", "user.email", "test@paperclip.local"]);
  await fs.writeFile(path.join(localRepo, "README.md"), "# Test repo\n", "utf8");
  await runGit(localRepo, ["add", "README.md"]);
  await runGit(localRepo, ["commit", "-m", "Initial commit"]);
  await runGit(localRepo, ["remote", "add", "origin", originRepo]);

  return { localRepo, originRepo, tempDirs };
}

async function insertProjectWithWorkspace(db: ReturnType<typeof createDb>, input: {
  companyId: string;
  projectId: string;
  workspaceId: string;
  cwd: string;
}) {
  await db.insert(companies).values({
    id: input.companyId,
    name: "TestCo",
    issuePrefix: `T${input.companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
    requireBoardApprovalForNewAgents: false,
  });

  await db.insert(projects).values({
    id: input.projectId,
    companyId: input.companyId,
    name: "Branch Test",
    status: "planned",
  });

  await db.insert(projectWorkspaces).values({
    id: input.workspaceId,
    companyId: input.companyId,
    projectId: input.projectId,
    name: "Primary",
    sourceType: "local_path",
    cwd: input.cwd,
    isPrimary: true,
  });
}

describeEmbeddedPostgres("projectFilesService", () => {
  let db!: ReturnType<typeof createDb>;
  let svc!: ReturnType<typeof projectFilesService>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  const tempDirs = new Set<string>();

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-project-files-service-");
    db = createDb(tempDb.connectionString);
    svc = projectFilesService(db);
  }, 20_000);

  afterEach(async () => {
    await db.delete(projectWorkspaces);
    await db.delete(projects);
    await db.delete(companies);

    for (const dir of tempDirs) {
      await fs.rm(dir, { recursive: true, force: true });
    }
    tempDirs.clear();
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  it("creates a local branch and pushes it to origin when the repo has origin", async () => {
    const companyId = randomUUID();
    const projectId = randomUUID();
    const workspaceId = randomUUID();
    const branchName = "feature/push-to-origin";
    const { localRepo, originRepo, tempDirs: repoDirs } = await createGitRepoWithOrigin();
    for (const dir of repoDirs) tempDirs.add(dir);

    await insertProjectWithWorkspace(db, { companyId, projectId, workspaceId, cwd: localRepo });

    const summary = await svc.createBranch(projectId, branchName);

    expect(summary.currentBranch).toBe(branchName);
    expect(summary.branches.some((branch) => branch.name === branchName && branch.current)).toBe(true);
    expect(summary.branches.find((branch) => branch.name === branchName)?.tracking).toBe(`origin/${branchName}`);

    const localBranch = (await runGit(localRepo, ["rev-parse", "--verify", branchName])).stdout.trim();
    expect(localBranch).toMatch(/^[0-9a-f]{40}$/);

    const remoteBranch = (await execFileAsync(
      "git",
      ["--git-dir", originRepo, "rev-parse", "--verify", `refs/heads/${branchName}`],
      { cwd: originRepo },
    )).stdout.trim();
    expect(remoteBranch).toBe(localBranch);
  });

  it("returns raw JSON text for editable project files", async () => {
    const companyId = randomUUID();
    const projectId = randomUUID();
    const workspaceId = randomUUID();
    const localDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-project-files-json-"));
    tempDirs.add(localDir);
    const rawJson = '{"id":9007199254740993123,"dup":1,"dup":2,"enabled":true}\n';
    await fs.writeFile(path.join(localDir, "config.json"), rawJson, "utf8");
    await insertProjectWithWorkspace(db, { companyId, projectId, workspaceId, cwd: localDir });

    const detail = await svc.readFile(projectId, "config.json");

    expect(detail.previewType).toBe("json");
    expect(detail.language).toBe("json");
    expect(detail.textContent).toBe(rawJson);
  });

  it("returns raw text for malformed JSON files", async () => {
    const companyId = randomUUID();
    const projectId = randomUUID();
    const workspaceId = randomUUID();
    const localDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-project-files-json-"));
    tempDirs.add(localDir);
    const malformedJson = '{"key": "value"\n';
    await fs.writeFile(path.join(localDir, "broken.json"), malformedJson, "utf8");
    await insertProjectWithWorkspace(db, { companyId, projectId, workspaceId, cwd: localDir });

    const detail = await svc.readFile(projectId, "broken.json");

    expect(detail.previewType).toBe("json");
    expect(detail.textContent).toBe(malformedJson);
  });

  it("pushes an existing local branch to origin without switching branches", async () => {
    const companyId = randomUUID();
    const projectId = randomUUID();
    const workspaceId = randomUUID();
    const branchName = "feature/context-menu-push";
    const { localRepo, originRepo, tempDirs: repoDirs } = await createGitRepoWithOrigin();
    for (const dir of repoDirs) tempDirs.add(dir);

    await insertProjectWithWorkspace(db, { companyId, projectId, workspaceId, cwd: localRepo });
    const currentBranch = (await runGit(localRepo, ["rev-parse", "--abbrev-ref", "HEAD"])).stdout.trim();
    await runGit(localRepo, ["branch", branchName]);

    const result = await svc.pushBranch(projectId, branchName);

    expect(result.status).toBe("success");
    expect((await runGit(localRepo, ["rev-parse", "--abbrev-ref", "HEAD"])).stdout.trim()).toBe(currentBranch);
    expect((await runGit(localRepo, ["rev-parse", "--abbrev-ref", `${branchName}@{upstream}`])).stdout.trim()).toBe(`origin/${branchName}`);

    const localBranch = (await runGit(localRepo, ["rev-parse", "--verify", branchName])).stdout.trim();
    const remoteBranch = (await execFileAsync(
      "git",
      ["--git-dir", originRepo, "rev-parse", "--verify", `refs/heads/${branchName}`],
      { cwd: originRepo },
    )).stdout.trim();
    expect(remoteBranch).toBe(localBranch);
  });
});
