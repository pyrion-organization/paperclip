import type { ReactNode } from "react";
import { Link } from "@/lib/router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SidebarSectionMenu as SidebarSectionMenuConfig } from "./SidebarSection";

interface SidebarSectionMenuProps {
  ariaLabel: string;
  headerContent: ReactNode;
  menu: SidebarSectionMenuConfig;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerClassName: string;
}

export function SidebarSectionMenu({
  ariaLabel,
  headerContent,
  menu,
  open,
  onOpenChange,
  triggerClassName,
}: SidebarSectionMenuProps) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-slot="icon-button"
          className={triggerClassName}
          aria-label={ariaLabel}
        >
          {headerContent}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {menu.actions?.map((action, index) => {
          if (action.type === "separator") {
            return <DropdownMenuSeparator key={`separator-${index}`} />;
          }
          const Icon = action.icon;
          const content = (
            <>
              {Icon ? <Icon className="size-4" /> : null}
              <span>{action.label}</span>
            </>
          );
          if (action.href) {
            return (
              <DropdownMenuItem key={`${action.label}-${index}`} asChild>
                <Link to={action.href}>{content}</Link>
              </DropdownMenuItem>
            );
          }
          return (
            <DropdownMenuItem key={`${action.label}-${index}`} onSelect={action.onSelect}>
              {content}
            </DropdownMenuItem>
          );
        })}
        {menu.radioChoices && menu.radioChoices.length > 0 ? (
          <DropdownMenuRadioGroup
            value={menu.radioValue}
            onValueChange={menu.onRadioValueChange}
            aria-label={menu.radioLabel}
          >
            {menu.radioChoices.map((choice) => (
              <DropdownMenuRadioItem key={choice.value} value={choice.value}>
                {choice.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
