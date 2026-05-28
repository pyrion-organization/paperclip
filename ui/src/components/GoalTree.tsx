import type { Goal } from "@paperclipai/shared";
import { Link } from "@/lib/router";
import { StatusBadge } from "./StatusBadge";
import { ChevronRight } from "lucide-react";
import { cn } from "../lib/classnames";
import { useMemo, useState } from "react";

interface GoalTreeProps {
  goals: Goal[];
  goalLink?: (goal: Goal) => string;
  onSelect?: (goal: Goal) => void;
}

interface GoalNodeProps {
  goal: Goal;
  allGoals: Goal[];
  depth: number;
  goalLink?: (goal: Goal) => string;
  onSelect?: (goal: Goal) => void;
}

function GoalNode({ goal, allGoals, depth, goalLink, onSelect }: GoalNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const childGoals = useMemo(
    () => allGoals.filter((g) => g.parentId === goal.id),
    [allGoals, goal.id],
  );
  const hasChildren = childGoals.length > 0;
  const link = goalLink?.(goal);

  const inner = (
    <>
      {hasChildren ? (
        <button type="button"
          className="p-0.5"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setExpanded(!expanded);
          }}
        >
          <ChevronRight
            className={cn("size-3 transition-transform", expanded && "rotate-90")}
          />
        </button>
      ) : (
        <span className="w-4" />
      )}
      <span className="text-xs text-muted-foreground capitalize">{goal.level}</span>
      <span className="flex-1 truncate">{goal.title}</span>
      <StatusBadge status={goal.status} />
    </>
  );

  const classes = cn(
    "flex items-center gap-2 px-3 py-1.5 text-sm transition-colors cursor-pointer hover:bg-accent/50",
  );

  return (
    <div>
      {link ? (
        <Link
          to={link}
          className={cn(classes, "no-underline text-inherit")}
          style={{ paddingLeft: `${depth * 16 + 12}px` }}
        >
          {inner}
        </Link>
      ) : (
        <button
          type="button"
          className={cn(classes, "w-full bg-transparent text-left")}
          style={{ paddingLeft: `${depth * 16 + 12}px` }}
          onClick={() => onSelect?.(goal)}
        >
          {inner}
        </button>
      )}
      {hasChildren && expanded && (
        <div>
          {childGoals.map((child) => (
            <GoalNode
              key={child.id}
              goal={child}
              allGoals={allGoals}
              depth={depth + 1}
              goalLink={goalLink}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function GoalTree({ goals, goalLink, onSelect }: GoalTreeProps) {
  const goalIds = new Set(goals.map((g) => g.id));
  const roots = goals.filter((g) => !g.parentId || !goalIds.has(g.parentId));

  if (goals.length === 0) {
    return <p className="text-sm text-muted-foreground">No goals.</p>;
  }

  return (
    <div className="border border-border py-1">
      {roots.map((goal) => (
        <GoalNode
          key={goal.id}
          goal={goal}
          allGoals={goals}
          depth={0}
          goalLink={goalLink}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
