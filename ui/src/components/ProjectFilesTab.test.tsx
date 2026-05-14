// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectFilesTab } from "./ProjectFilesTab";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const pushToastMock = vi.fn();
const projectsApiMock = vi.hoisted(() => ({
  filesSummary: vi.fn(),
  filesTree: vi.fn(),
  fileContent: vi.fn(),
  saveFileContent: vi.fn(),
  gitStatus: vi.fn(),
}));
const RAW_JSON = '{"id":9007199254740993123,"dup":1,"dup":2,"enabled":true}\n';
const EDITED_RAW_JSON = '{"id":9007199254740993123,"dup":1,"dup":2,"enabled":false}\n';

vi.mock("../api/projects", () => ({
  projectsApi: projectsApiMock,
}));

vi.mock("../context/ToastContext", () => ({
  useToast: () => ({ pushToast: pushToastMock }),
}));

vi.mock("./ProjectCodeEditor", () => ({
  ProjectCodeEditor: ({
    value,
    readOnly,
    language,
    onChange,
  }: {
    value: string;
    readOnly: boolean;
    language: string | null;
    onChange: (value: string) => void;
  }) => (
    <div>
      <textarea
        data-testid="project-code-editor"
        data-language={language ?? ""}
        data-readonly={String(readOnly)}
        readOnly={readOnly}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      <button
        type="button"
        data-testid="edit-json"
        onClick={() => onChange(value.replace('"enabled":true', '"enabled":false'))}
      >
        Edit JSON
      </button>
    </div>
  ),
}));

function projectSummary() {
  return {
    available: true,
    companyId: "company-1",
    projectId: "project-1",
    workspaceId: null,
    workspaceName: null,
    rootPath: "/tmp/project-1",
    repoRoot: null,
    gitEnabled: false,
    hasRemote: false,
    currentBranch: null,
    branches: [],
    dirtyWorktree: null,
    aheadBehind: null,
  };
}

function jsonFileDetail(content: string) {
  return {
    path: "config.json",
    name: "config.json",
    fileType: "text" as const,
    previewType: "json" as const,
    size: content.length,
    language: "json",
    textContent: content,
    base64Content: null,
    mimeType: "application/json",
    updatedAt: new Date("2026-05-14T00:00:00.000Z"),
  };
}

describe("ProjectFilesTab", () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    pushToastMock.mockReset();
    projectsApiMock.filesSummary.mockResolvedValue(projectSummary());
    projectsApiMock.filesTree.mockResolvedValue({
      path: "",
      entries: [
        {
          name: "config.json",
          path: "config.json",
          kind: "file",
          hiddenByDefault: false,
          fileType: "text",
        },
      ],
    });
    projectsApiMock.fileContent.mockResolvedValue(jsonFileDetail(RAW_JSON));
    projectsApiMock.saveFileContent.mockImplementation((_projectId, input) => Promise.resolve(jsonFileDetail(input.content)));
    projectsApiMock.gitStatus.mockResolvedValue({ entries: [] });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    queryClient.clear();
    container.remove();
    vi.clearAllMocks();
  });

  it("allows JSON project files to be edited and saved", async () => {
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ProjectFilesTab projectId="project-1" companyId="company-1" />
        </QueryClientProvider>,
      );
    });

    await vi.waitFor(() => {
      expect(container.querySelector("[data-testid='project-code-editor']")).not.toBeNull();
    });

    const editor = container.querySelector("[data-testid='project-code-editor']") as HTMLTextAreaElement;
    expect(editor.dataset.readonly).toBe("false");
    expect(editor.dataset.language).toBe("json");

    const editButton = container.querySelector("[data-testid='edit-json']") as HTMLButtonElement;
    act(() => {
      editButton.click();
    });

    await vi.waitFor(() => {
      const saveButton = Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("Save")) as HTMLButtonElement | undefined;
      expect(saveButton).toBeDefined();
      expect(saveButton?.disabled).toBe(false);
    });

    const saveButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Save")) as HTMLButtonElement;
    act(() => {
      saveButton.click();
    });

    await vi.waitFor(() => {
      expect(projectsApiMock.saveFileContent).toHaveBeenCalledWith(
        "project-1",
        { path: "config.json", content: EDITED_RAW_JSON },
        "company-1",
      );
    });
  });
});
