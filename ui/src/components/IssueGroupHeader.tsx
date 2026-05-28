import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "../lib/classnames";

type IssueGroupHeaderProps = {
  label: string;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  trailing?: ReactNode;
  trailingSlot?: () => ReactNode;
  className?: string;
};

export function IssueGroupHeader({
  label,
  collapsible = false,
  collapsed = false,
  onToggle,
  trailing,
  trailingSlot,
  className,
}: IssueGroupHeaderProps) {
  const trailingContent = trailingSlot ? trailingSlot() : trailing;

  return (
    <div className={cn("flex items-center py-1.5 pl-1 pr-3", className)}>
      {collapsible ? (
        <button
          type="button"
          className="flex min-w-0 items-center gap-1.5 text-left"
          aria-expanded={!collapsed}
          onClick={onToggle}
        >
          <ChevronRight
            className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", !collapsed && "rotate-90")}
          />
          <span className="truncate text-sm font-semibold uppercase tracking-wide">
            {label}
          </span>
        </button>
      ) : (
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-semibold uppercase tracking-wide">
            {label}
          </span>
        </div>
      )}
      {trailingContent ? <div className="ml-auto">{trailingContent}</div> : null}
    </div>
  );
}
