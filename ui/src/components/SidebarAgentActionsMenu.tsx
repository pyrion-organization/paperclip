import { Link } from "@/lib/router";
import {
  MoreHorizontal,
  PauseCircle,
  Pencil,
  PlayCircle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SidebarAgentActionsMenuProps {
  editHref: string;
  isBudgetPaused: boolean;
  isMobile: boolean;
  isPaused: boolean;
  onOpenChange: (open: boolean) => void;
  onPauseResume: (action: "pause" | "resume") => void;
  open: boolean;
  pauseResumeDisabled: boolean;
  pauseResumeDisabledLabel: string;
  setSidebarOpen: (open: boolean) => void;
  triggerClassName: string;
  triggerLabel: string;
}

export function SidebarAgentActionsMenu({
  editHref,
  isBudgetPaused,
  isMobile,
  isPaused,
  onOpenChange,
  onPauseResume,
  open,
  pauseResumeDisabled,
  pauseResumeDisabledLabel,
  setSidebarOpen,
  triggerClassName,
  triggerLabel,
}: SidebarAgentActionsMenuProps) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={triggerClassName}
          aria-label={triggerLabel}
        >
          <MoreHorizontal className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem asChild>
          <Link
            to={editHref}
            onClick={() => {
              if (isMobile) setSidebarOpen(false);
            }}
          >
            <Pencil className="size-4" />
            <span>Edit agent</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            if (pauseResumeDisabled) return;
            onPauseResume(isPaused ? "resume" : "pause");
          }}
          disabled={pauseResumeDisabled}
          title={isBudgetPaused ? "Agent was paused by budget limits" : undefined}
        >
          {isPaused ? <PlayCircle className="size-4" /> : <PauseCircle className="size-4" />}
          <span>{pauseResumeDisabledLabel}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
