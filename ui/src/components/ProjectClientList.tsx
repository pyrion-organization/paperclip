import type { ProjectClientRef } from "@paperclipai/shared";
import { Link } from "@/lib/router";
import { clientUrl, cn, readMetadataString } from "../lib/utils";
import { StatusBadge } from "./StatusBadge";

interface ProjectClientListProps {
  clients: ProjectClientRef[];
  projectStatus?: string;
  emptyMessage?: string;
  compact?: boolean;
  maxVisible?: number;
}

export function ProjectClientList({
  clients,
  projectStatus,
  emptyMessage = "No linked clients.",
  compact = false,
  maxVisible,
}: ProjectClientListProps) {
  if (clients.length === 0) {
    return <p className={cn(compact ? "text-xs" : "text-sm", "text-muted-foreground")}>{emptyMessage}</p>;
  }

  const visibleClients = maxVisible ? clients.slice(0, maxVisible) : clients;
  const hiddenCount = Math.max(clients.length - visibleClients.length, 0);

  return (
    <div className={cn(compact ? "space-y-1.5" : "space-y-2")}>
      {visibleClients.map((client) => {
        const cnpj = readMetadataString(client.metadata, "cnpj");
        return (
          <div
            key={client.linkId}
            className={cn(
              "rounded-lg border border-border bg-card px-3 py-2",
              compact && "border-none bg-transparent px-0 py-0",
            )}
          >
            <div className={cn("flex items-center min-w-0", compact ? "gap-1.5" : "justify-between gap-2")}>
              <div className={cn("flex items-center min-w-0", compact ? "gap-1.5" : "gap-2")}>
                <Link
                  to={clientUrl({ id: client.clientId })}
                  className={cn("truncate font-medium hover:underline", compact ? "text-xs" : "text-sm")}
                >
                  {client.name}
                </Link>
                {client.relationshipTags.length > 0 ? (
                  <span className={cn("truncate text-muted-foreground", compact ? "text-[11px]" : "text-xs")}>
                    {client.relationshipTags.join(", ")}
                  </span>
                ) : null}
                {client.projectAliases.length > 0 ? (
                  <span className={cn("truncate text-muted-foreground", compact ? "text-[11px]" : "text-xs")}>
                    aliases: {client.projectAliases.join(", ")}
                  </span>
                ) : null}
              </div>
              {projectStatus ? (
                <div className={cn("shrink-0", compact && "ml-1")}>
                  <StatusBadge status={projectStatus} />
                </div>
              ) : null}
            </div>
            {!compact && (
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {client.contactName ? <span>{client.contactName}</span> : null}
                {client.email ? <span>{client.email}</span> : null}
                {cnpj ? <span>CNPJ {cnpj}</span> : null}
                {client.relationshipDescription ? <span>{client.relationshipDescription}</span> : null}
              </div>
            )}
          </div>
        );
      })}
      {hiddenCount > 0 ? (
        <p className="text-xs text-muted-foreground">
          +{hiddenCount} more linked client{hiddenCount === 1 ? "" : "s"}
        </p>
      ) : null}
    </div>
  );
}
