export type FileTreeNode = {
  name: string;
  path: string;
  kind: "dir" | "file";
  children: FileTreeNode[];
  action?: string | null;
};

export type FileTreeBadgeVariant = "ok" | "warning" | "error" | "info" | "pending";

export type FileTreeBadge = {
  label: string;
  status: FileTreeBadgeVariant;
  tooltip?: string;
};

export type FileTreeTone = "default" | "warning" | "error" | "muted";

export type FileTreeEmptyState = {
  title?: string;
  description?: string;
};

export type FileTreeErrorState = {
  message: string;
  retry?: () => void;
};

export function buildFileTree(
  files: Record<string, unknown>,
  actionMap?: Map<string, string>,
): FileTreeNode[] {
  const root: FileTreeNode = { name: "", path: "", kind: "dir", children: [] };
  const nodesByPath = new Map<string, FileTreeNode>([["", root]]);

  for (const filePath of Object.keys(files)) {
    const segments = filePath.split("/").filter(Boolean);
    let current = root;
    let currentPath = "";
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const isLeaf = i === segments.length - 1;
      let next = nodesByPath.get(currentPath);
      if (!next) {
        next = {
          name: segment,
          path: currentPath,
          kind: isLeaf ? "file" : "dir",
          children: [],
          action: isLeaf ? (actionMap?.get(filePath) ?? null) : null,
        };
        current.children.push(next);
        nodesByPath.set(currentPath, next);
      }
      current = next;
    }
  }

  function sortNode(node: FileTreeNode) {
    node.children.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "file" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    node.children.forEach(sortNode);
  }

  sortNode(root);
  return root.children;
}

export function countFiles(nodes: FileTreeNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.kind === "file") count++;
    else count += countFiles(node.children);
  }
  return count;
}

export function collectAllPaths(
  nodes: FileTreeNode[],
  type: "file" | "dir" | "all" = "all",
): Set<string> {
  const paths = new Set<string>();
  for (const node of nodes) {
    if (type === "all" || node.kind === type) paths.add(node.path);
    for (const p of collectAllPaths(node.children, type)) paths.add(p);
  }
  return paths;
}

export type FrontmatterData = Record<string, string | string[]>;

export function parseFrontmatter(content: string): { data: FrontmatterData; body: string } | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;

  const data: FrontmatterData = {};
  const rawYaml = match[1];
  const body = match[2];

  let currentKey: string | null = null;
  let currentList: string[] | null = null;

  for (const line of rawYaml.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (trimmed.startsWith("- ") && currentKey) {
      if (!currentList) currentList = [];
      currentList.push(trimmed.slice(2).trim().replace(/^["']|["']$/g, ""));
      continue;
    }

    if (currentKey && currentList) {
      data[currentKey] = currentList;
      currentList = null;
      currentKey = null;
    }

    const kvMatch = trimmed.match(/^([a-zA-Z_][\w-]*)\s*:\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1];
      const val = kvMatch[2].trim().replace(/^["']|["']$/g, "");
      if (val === "null") {
        currentKey = null;
        continue;
      }
      if (val) {
        data[key] = val;
        currentKey = null;
      } else {
        currentKey = key;
      }
    }
  }

  if (currentKey && currentList) {
    data[currentKey] = currentList;
  }

  return Object.keys(data).length > 0 ? { data, body } : null;
}

export const FRONTMATTER_FIELD_LABELS: Record<string, string> = {
  name: "Name",
  title: "Title",
  kind: "Kind",
  reportsTo: "Reports to",
  skills: "Skills",
  status: "Status",
  description: "Description",
  priority: "Priority",
  assignee: "Assignee",
  project: "Project",
  recurring: "Recurring",
  targetDate: "Target date",
};
