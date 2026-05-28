import { FileTree } from "./FileTree";
import type { FileTreeProps } from "./FileTree";

export function PackageFileTree({ wrapLabels = false, ...props }: FileTreeProps) {
  return <FileTree {...props} wrapLabels={wrapLabels} />;
}
export type {
  FileTreeProps,
} from "./FileTree";
export type {
  FileTreeBadge,
  FileTreeBadgeVariant,
  FileTreeEmptyState,
  FileTreeErrorState,
  FileTreeNode,
  FileTreeTone,
  FrontmatterData,
} from "./file-tree-utils";
