import { type ReactNode } from "react";
import { Link } from "@/lib/router";
import { cn } from "../lib/classnames";

interface EntityRowProps {
  leading?: ReactNode;
  leadingSlot?: () => ReactNode;
  identifier?: string;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  trailingSlot?: () => ReactNode;
  selected?: boolean;
  to?: string;
  onClick?: () => void;
  className?: string;
  reserveSubtitleSpace?: boolean;
}

export function EntityRow({
  leading,
  leadingSlot,
  identifier,
  title,
  subtitle,
  trailing,
  trailingSlot,
  selected,
  to,
  onClick,
  className,
  reserveSubtitleSpace,
}: EntityRowProps) {
  const isClickable = !!(to || onClick);
  const classes = cn(
    "flex items-center gap-3 px-4 py-2 text-sm border-b border-border last:border-b-0 transition-colors",
    isClickable && "cursor-pointer hover:bg-accent/50",
    selected && "bg-accent/30",
    className
  );
  const leadingContent = leadingSlot ? leadingSlot() : leading;
  const trailingContent = trailingSlot ? trailingSlot() : trailing;

  const content = (
    <>
      {leadingContent && <div className="flex items-center gap-2 shrink-0">{leadingContent}</div>}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {identifier && (
            <span className="text-xs text-muted-foreground font-mono shrink-0 relative top-[1px]">
              {identifier}
            </span>
          )}
          <span className="truncate">{title}</span>
        </div>
        {(subtitle || reserveSubtitleSpace) && (
          <p
            className={cn("text-xs text-muted-foreground truncate mt-0.5 min-h-4", !subtitle && "invisible")}
            aria-hidden={!subtitle}
          >
            {subtitle}
          </p>
        )}
      </div>
      {trailingContent && <div className="flex items-center gap-2 shrink-0">{trailingContent}</div>}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={cn("no-underline text-inherit", classes)} onClick={onClick}>
        {content}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        className={cn(classes, "w-full bg-transparent text-left")}
        onClick={onClick}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={classes}>
      {content}
    </div>
  );
}
