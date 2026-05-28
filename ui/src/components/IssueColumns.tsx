import { Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { InboxIssueColumn } from "../lib/inbox";
export { InboxIssueMetaLeading } from "./InboxIssueMetaLeading";
export { InboxIssueTrailingColumns } from "./InboxIssueTrailingColumns";

const issueColumnLabels: Record<InboxIssueColumn, string> = {
  status: "Status",
  id: "ID",
  assignee: "Assignee",
  project: "Project",
  workspace: "Workspace",
  parent: "Parent issue",
  labels: "Tags",
  updated: "Last updated",
};

const issueColumnDescriptions: Record<InboxIssueColumn, string> = {
  status: "Issue state chip on the left edge.",
  id: "Ticket identifier like PAP-1009.",
  assignee: "Assigned agent or board user.",
  project: "Linked project pill with its color.",
  workspace: "Execution or project workspace used for the issue.",
  parent: "Parent issue identifier and title.",
  labels: "Issue labels and tags.",
  updated: "Latest visible activity time.",
};

export function IssueColumnPicker({
  availableColumns,
  visibleColumnSet,
  onToggleColumn,
  onResetColumns,
  title,
  iconOnly = false,
}: {
  availableColumns: InboxIssueColumn[];
  visibleColumnSet: ReadonlySet<InboxIssueColumn>;
  onToggleColumn: (column: InboxIssueColumn, enabled: boolean) => void;
  onResetColumns: () => void;
  title: string;
  iconOnly?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={iconOnly ? "outline" : "ghost"}
          size={iconOnly ? "icon" : "sm"}
          className={iconOnly ? "size-8 shrink-0" : "hidden h-8 shrink-0 px-2 text-xs sm:inline-flex"}
          title="Columns"
        >
          <Columns3 className={iconOnly ? "size-3.5" : "mr-1 size-3.5"} />
          {!iconOnly && "Columns"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[300px] rounded-xl border-border/70 p-1.5 shadow-xl shadow-black/10">
        <DropdownMenuLabel className="px-2 pb-1 pt-1.5">
          <div className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Desktop issue rows
            </div>
            <div className="text-sm font-medium text-foreground">
              {title}
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {availableColumns.map((column) => (
          <DropdownMenuCheckboxItem
            key={column}
            checked={visibleColumnSet.has(column)}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={(checked) => onToggleColumn(column, checked === true)}
            className="items-start rounded-lg px-3 py-2.5 pl-8"
          >
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-foreground">
                {issueColumnLabels[column]}
              </span>
              <span className="text-xs leading-relaxed text-muted-foreground">
                {issueColumnDescriptions[column]}
              </span>
            </span>
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={onResetColumns}
          className="rounded-lg px-3 py-2 text-sm"
        >
          Reset defaults
          <span className="ml-auto text-xs text-muted-foreground">status, id, updated</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
