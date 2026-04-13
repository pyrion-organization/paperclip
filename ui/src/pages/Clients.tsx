import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { clientsApi } from "../api/clients";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EntityRow } from "../components/EntityRow";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Users, Plus } from "lucide-react";

export function Clients() {
  const { selectedCompanyId } = useCompany();
  const { openNewClient } = useDialog();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Clients" }]);
  }, [setBreadcrumbs]);

  const { data: clients, isLoading, error } = useQuery({
    queryKey: queryKeys.clients.list(selectedCompanyId!),
    queryFn: () => clientsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={Users} message="Select a company to view clients." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button size="sm" variant="outline" onClick={openNewClient}>
          <Plus className="h-4 w-4 mr-1" />
          Add Client
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {!isLoading && (clients ?? []).length === 0 && (
        <EmptyState
          icon={Users}
          message="No clients yet."
          action="Add Client"
          onAction={openNewClient}
        />
      )}

      {(clients ?? []).length > 0 && (
        <div className="border border-border">
          {clients!.map((client) => (
            <EntityRow
              key={client.id}
              title={client.name}
              subtitle={[client.email, client.cnpj].filter(Boolean).join(" · ") || undefined}
              to={`/clients/${client.id}`}
              trailing={
                <StatusBadge status={client.status} />
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
