import { cn } from "@/lib/classnames";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { deriveInitials } from "./identity-utils";

type IdentitySize = "xs" | "sm" | "default" | "lg";

export interface IdentityProps {
  name: string;
  avatarUrl?: string | null;
  initials?: string;
  size?: IdentitySize;
  className?: string;
}

const textSize: Record<IdentitySize, string> = {
  xs: "text-sm",
  sm: "text-xs",
  default: "text-sm",
  lg: "text-sm",
};

export function Identity({ name, avatarUrl, initials, size = "default", className }: IdentityProps) {
  const displayInitials = initials ?? deriveInitials(name);

  return (
    <span className={cn("inline-flex gap-1.5 items-center", size === "xs" && "gap-1", size === "lg" && "gap-2", className)}>
      <Avatar size={size}>
        {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
        <AvatarFallback>{displayInitials}</AvatarFallback>
      </Avatar>
      <span className={cn("truncate", textSize[size])}>{name}</span>
    </span>
  );
}
