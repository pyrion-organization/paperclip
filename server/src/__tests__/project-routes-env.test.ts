import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveManagedProjectWorkspaceDir } from "../home-paths.js";

const mockProjectService = vi.hoisted(() => ({
  list: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  createWorkspace: vi.fn(),
  listWorkspaces: vi.fn(),
  updateWorkspace: vi.fn(),
  removeWorkspace: vi.fn(),
  remove: vi.fn(),
  resolveByReference: vi.fn(),
}));
const mockSecretService = vi.hoisted(() => ({
  normalizeEnvBindingsForPersistence: vi.fn(),
}));
const mockProjectFilesService = vi.hoisted(() => ({
  deletePath: vi.fn(),
  deleteBranch: vi.fn(),
  unstageFiles: vi.fn(),
  pushFiles: vi.fn(),
}));
const mockEnvironmentService = vi.hoisted(() => ({
  getById: vi.fn(),
}));
const mockWorkspaceOperationService = vi.hoisted(() => ({}));
const mockInitWorkspaceGit = vi.hoisted(() => vi.fn());
const mockLogActivity = vi.hoisted(() => vi.fn());
const mockGetTelemetryClient = vi.hoisted(() => vi.fn());

vi.mock("../telemetry.js", () => ({
  getTelemetryClient: mockGetTelemetryClient,
}));

vi.mock("../services/index.js", () => ({
  environmentService: () => mockEnvironmentService,
  logActivity: mockLogActivity,
  initWorkspaceGit: mockInitWorkspaceGit,
  projectFilesService: () => mockProjectFilesService,
  projectService: () => mockProjectService,
  secretService: () => mockSecretService,
  workspaceOperationService: () => mockWorkspaceOperationService,
}));

vi.mock("../services/environments.js", () => ({
  environmentService: () => mockEnvironmentService,
}));

vi.mock("../services/secrets.js", () => ({
  secretService: () => mockSecretService,
}));

vi.mock("../services/workspace-runtime.js", () => ({
  startRuntimeServicesForWorkspaceControl: vi.fn(),
  stopRuntimeServicesForProjectWorkspace: vi.fn(),
}));

function registerModuleMocks() {
  vi.doMock("../telemetry.js", () => ({
    getTelemetryClient: mockGetTelemetryClient,
  }));

  vi.doMock("../services/index.js", () => ({
    environmentService: () => mockEnvironmentService,
    logActivity: mockLogActivity,
    initWorkspaceGit: mockInitWorkspaceGit,
    projectFilesService: () => mockProjectFilesService,
    projectService: () => mockProjectService,
    secretService: () => mockSecretService,
    workspaceOperationService: () => mockWorkspaceOperationService,
  }));

  vi.doMock("../services/environments.js", () => ({
    environmentService: () => mockEnvironmentService,
  }));

  vi.doMock("../services/secrets.js", () => ({
    secretService: () => mockSecretService,
  }));

  vi.doMock("../services/workspace-runtime.js", () => ({
    startRuntimeServicesForWorkspaceControl: vi.fn(),
    stopRuntimeServicesForProjectWorkspace: vi.fn(),
  }));
}

async function createApp() {
  const [{ projectRoutes }, { errorHandler }] = await Promise.all([
    vi.importActual<typeof import("../routes/projects.js")>("../routes/projects.js"),
    vi.importActual<typeof import("../middleware/index.js")>("../middleware/index.js"),
  ]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = {
      type: "board",
      userId: "board-user",
      companyIds: ["company-1"],
      source: "local_implicit",
      isInstanceAdmin: false,
    };
    next();
  });
  app.use("/api", projectRoutes({} as any));
  app.use(errorHandler);
  return app;
}

function buildProject(overrides: Record<string, unknown> = {}) {
  return {
    id: "project-1",
    companyId: "company-1",
    urlKey: "project-1",
    goalId: null,
    goalIds: [],
    goals: [],
    name: "Project",
    description: null,
    status: "backlog",
    leadAgentId: null,
    targetDate: null,
    color: null,
    env: null,
    pauseReason: null,
    pausedAt: null,
    executionWorkspacePolicy: null,
    codebase: {
      workspaceId: null,
      repoUrl: null,
      repoRef: null,
      defaultRef: null,
      repoName: null,
      localFolder: null,
      managedFolder: "/tmp/project",
      effectiveLocalFolder: "/tmp/project",
      origin: "managed_checkout",
    },
    workspaces: [],
    primaryWorkspace: null,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("project env routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("../routes/projects.js");
    vi.doUnmock("../routes/authz.js");
    vi.doUnmock("../middleware/index.js");
    vi.doUnmock("../services/environments.js");
    vi.doUnmock("../services/secrets.js");
    registerModuleMocks();
    vi.clearAllMocks();
    mockGetTelemetryClient.mockReturnValue({ track: vi.fn() });
    mockProjectService.getById.mockResolvedValue(null);
    mockProjectService.resolveByReference.mockResolvedValue({ ambiguous: false, project: null });
    mockProjectService.createWorkspace.mockResolvedValue(null);
    mockProjectService.updateWorkspace.mockResolvedValue(null);
    mockProjectService.listWorkspaces.mockResolvedValue([]);
    mockProjectFilesService.deletePath.mockResolvedValue({
      projectId: "project-1",
      path: "docs/old.md",
      deleted: true,
    });
    mockProjectFilesService.deleteBranch.mockResolvedValue({ projectId: "project-1" });
    mockProjectFilesService.unstageFiles.mockResolvedValue({ status: "success" });
    mockProjectFilesService.pushFiles.mockResolvedValue({ status: "success", message: "Pushed main" });
    mockEnvironmentService.getById.mockReset();
    mockSecretService.normalizeEnvBindingsForPersistence.mockImplementation(async (_companyId, env) => env);
  });

  it("normalizes env bindings on create and logs only env keys", async () => {
    const normalizedEnv = {
      API_KEY: {
        type: "secret_ref",
        secretId: "11111111-1111-4111-8111-111111111111",
        version: "latest",
      },
    };
    mockSecretService.normalizeEnvBindingsForPersistence.mockResolvedValue(normalizedEnv);
    mockProjectService.create.mockResolvedValue(buildProject({ env: normalizedEnv }));

    const app = await createApp();
    const res = await request(app)
      .post("/api/companies/company-1/projects")
      .send({
        name: "Project",
        env: normalizedEnv,
      });

    expect([200, 201], JSON.stringify(res.body)).toContain(res.status);
    expect(mockSecretService.normalizeEnvBindingsForPersistence).toHaveBeenCalledWith(
      "company-1",
      normalizedEnv,
      expect.objectContaining({ fieldPath: "env" }),
    );
    expect(mockProjectService.create).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({ env: normalizedEnv }),
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        details: expect.objectContaining({
          envKeys: ["API_KEY"],
        }),
      }),
    );
  }, 20_000);

  it("normalizes env bindings on update and avoids logging raw values", async () => {
    const normalizedEnv = {
      PLAIN_KEY: { type: "plain", value: "top-secret" },
    };
    mockSecretService.normalizeEnvBindingsForPersistence.mockResolvedValue(normalizedEnv);
    mockProjectService.getById.mockResolvedValue(buildProject());
    mockProjectService.update.mockResolvedValue(buildProject({ env: normalizedEnv }));

    const app = await createApp();
    const res = await request(app)
      .patch("/api/projects/project-1")
      .send({
        env: normalizedEnv,
      });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        details: {
          changedKeys: ["env"],
          envKeys: ["PLAIN_KEY"],
        },
      }),
    );
  }, 10_000);

  it("deletes project file tree paths through the board-only route", async () => {
    mockProjectService.getById.mockResolvedValue(buildProject());

    const app = await createApp();
    const res = await request(app)
      .delete("/api/projects/project-1/files/tree")
      .query({ path: "docs/old.md" });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(mockProjectFilesService.deletePath).toHaveBeenCalledWith("project-1", "docs/old.md");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "project.path_deleted",
        companyId: "company-1",
        entityId: "project-1",
        details: { path: "docs/old.md" },
      }),
    );
  });

  it("rejects non-string branch delete names before service access", async () => {
    mockProjectService.getById.mockResolvedValue(buildProject());

    const app = await createApp();
    const res = await request(app)
      .delete("/api/projects/project-1/files/branch")
      .query({ name: ["feature/a", "feature/b"] });

    expect(res.status).toBe(400);
    expect(mockProjectFilesService.deleteBranch).not.toHaveBeenCalled();
  });

  it("logs git unstage mutations", async () => {
    mockProjectService.getById.mockResolvedValue(buildProject());

    const app = await createApp();
    const res = await request(app)
      .post("/api/projects/project-1/files/git-unstage")
      .send({ paths: ["server/src/index.ts"] });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(mockProjectFilesService.unstageFiles).toHaveBeenCalledWith("project-1", ["server/src/index.ts"]);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "project.git_unstaged",
        companyId: "company-1",
        entityId: "project-1",
        details: {
          pathCount: 1,
          paths: ["server/src/index.ts"],
        },
      }),
    );
  });

  it("logs git push mutations", async () => {
    mockProjectService.getById.mockResolvedValue(buildProject());

    const app = await createApp();
    const res = await request(app)
      .post("/api/projects/project-1/files/git-push")
      .send({});

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(mockProjectFilesService.pushFiles).toHaveBeenCalledWith("project-1");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "project.git_pushed",
        companyId: "company-1",
        entityId: "project-1",
        details: {
          status: "success",
          message: "Pushed main",
        },
      }),
    );
  });

  it("initializes managed cwd for standalone repo-backed workspace creation", async () => {
    const createdWorkspace = {
      id: "workspace-1",
      companyId: "company-1",
      projectId: "project-1",
      name: "Repo workspace",
      sourceType: "git_repo",
      cwd: null,
      repoUrl: "https://github.com/paperclipai/paperclip.git",
      repoRef: null,
      defaultRef: null,
      visibility: "default",
      setupCommand: null,
      cleanupCommand: null,
      remoteProvider: null,
      remoteWorkspaceRef: null,
      sharedWorkspaceKey: null,
      metadata: null,
      runtimeConfig: null,
      isPrimary: false,
      runtimeServices: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const expectedWorkspaceCwd = resolveManagedProjectWorkspaceDir({
      companyId: "company-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
    });
    mockProjectService.getById.mockResolvedValue(buildProject());
    mockProjectService.createWorkspace.mockResolvedValue(createdWorkspace);
    mockProjectService.updateWorkspace.mockResolvedValue({
      ...createdWorkspace,
      cwd: expectedWorkspaceCwd,
    });

    const app = await createApp();
    const res = await request(app)
      .post("/api/projects/project-1/workspaces")
      .send({
        name: "Repo workspace",
        sourceType: "git_repo",
        repoUrl: "https://github.com/paperclipai/paperclip.git",
      });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(mockProjectService.updateWorkspace).toHaveBeenCalledWith("project-1", "workspace-1", {
      cwd: expectedWorkspaceCwd,
      name: "Repo workspace",
    });
    expect(res.body.cwd).toBe(expectedWorkspaceCwd);
  });

  it("relocates repo-backed project workspaces into the project workspace directory on create", async () => {
    const repoWorkspace = {
      id: "workspace-1",
      companyId: "company-1",
      projectId: "project-1",
      name: "paperclip",
      sourceType: "git_repo",
      cwd: "/home/core/.paperclip/instances/default/projects/company-1/project-1/workspace-1/_default",
      repoUrl: "https://github.com/paperclipai/paperclip.git",
      repoRef: null,
      defaultRef: null,
      visibility: "default",
      setupCommand: null,
      cleanupCommand: null,
      remoteProvider: null,
      remoteWorkspaceRef: null,
      sharedWorkspaceKey: null,
      metadata: null,
      runtimeConfig: null,
      isPrimary: true,
      runtimeServices: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockProjectService.create.mockResolvedValue(buildProject({ id: "project-1", name: "Project" }));
    mockProjectService.createWorkspace.mockResolvedValue({ ...repoWorkspace, cwd: null });
    mockProjectService.updateWorkspace.mockResolvedValue(repoWorkspace);
    mockProjectService.getById.mockResolvedValue(buildProject({
      id: "project-1",
      name: "Project",
      codebase: {
        workspaceId: repoWorkspace.id,
        repoUrl: repoWorkspace.repoUrl,
        repoRef: null,
        defaultRef: null,
        repoName: "paperclip",
        localFolder: repoWorkspace.cwd,
        managedFolder: repoWorkspace.cwd,
        effectiveLocalFolder: repoWorkspace.cwd,
        origin: "local_folder",
      },
      workspaces: [repoWorkspace],
      primaryWorkspace: repoWorkspace,
    }));

    const app = await createApp();
    const res = await request(app)
      .post("/api/companies/company-1/projects")
      .send({
        name: "Project",
        workspace: {
          name: "paperclip",
          repoUrl: "https://github.com/paperclipai/paperclip.git",
        },
      });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const expectedWorkspaceCwd = resolveManagedProjectWorkspaceDir({
      companyId: "company-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
    });
    expect(mockProjectService.updateWorkspace).toHaveBeenCalledWith(
      "project-1",
      "workspace-1",
      expect.objectContaining({
        cwd: expectedWorkspaceCwd,
        name: "paperclip",
      }),
    );
  });

  it("removes a newly created project when initial workspace creation throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockProjectService.create.mockResolvedValue(buildProject({ id: "project-1", name: "Project" }));
    mockProjectService.createWorkspace.mockRejectedValue(new Error("workspace failed"));

    const app = await createApp();
    const res = await request(app)
      .post("/api/companies/company-1/projects")
      .send({
        name: "Project",
        workspace: {
          name: "paperclip",
          repoUrl: "https://github.com/paperclipai/paperclip.git",
        },
      });

    expect(res.status).toBe(500);
    expect(mockProjectService.remove).toHaveBeenCalledWith("project-1");
    expect(mockProjectService.updateWorkspace).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  }, 15000);
});
