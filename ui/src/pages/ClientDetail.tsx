import { useEffect, useState } from "react";
import { useParams } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ClientProject } from "@paperclipai/shared";
import { CLIENT_STATUSES, CLIENT_PROJECT_STATUSES, CLIENT_PROJECT_TYPES, CLIENT_PROJECT_BILLING_TYPES } from "@paperclipai/shared";
import { clientsApi } from "../api/clients";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { formatDate } from "../lib/utils";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { LinkClientProjectDialog } from "../components/LinkClientProjectDialog";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Pencil, FolderOpen } from "lucide-react";

export function ClientDetail() {
  const { clientId } = useParams<{ clientId: string }>();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string | null>>({});

  const { data: client, isLoading } = useQuery({
    queryKey: queryKeys.clients.detail(clientId!),
    queryFn: () => clientsApi.get(clientId!),
    enabled: !!clientId,
  });

  const { data: clientProjects } = useQuery({
    queryKey: queryKeys.clients.projects(clientId!),
    queryFn: () => clientsApi.listProjects(clientId!),
    enabled: !!clientId,
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: "Clients", href: "/clients" },
      { label: client?.name ?? "..." },
    ]);
  }, [setBreadcrumbs, client?.name]);

  const updateClient = useMutation({
    mutationFn: (data: Record<string, unknown>) => clientsApi.update(clientId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.detail(clientId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.list(selectedCompanyId!) });
      setEditing(false);
    },
  });

  const deleteClientProject = useMutation({
    mutationFn: (id: string) => clientsApi.removeProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.projects(clientId!) });
    },
  });

  if (isLoading || !client) {
    return <PageSkeleton variant="detail" />;
  }

  function startEditing() {
    setEditForm({
      name: client!.name,
      email: client!.email ?? "",
      cnpj: client!.cnpj ?? "",
      phone: client!.phone ?? "",
      contactName: client!.contactName ?? "",
      notes: client!.notes ?? "",
      status: client!.status,
    });
    setEditing(true);
  }

  function handleSave() {
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(editForm)) {
      patch[key] = value === "" ? null : value;
    }
    if (editForm.name) patch.name = editForm.name;
    updateClient.mutate(patch);
  }

  function formatCurrency(cents: number | null) {
    if (cents == null) return "-";
    return `R$ ${(cents / 100).toFixed(2)}`;
  }

  return (
    <div className="space-y-6">
      {/* Client Info */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-lg font-semibold">{client.name}</h2>
          <div className="flex items-center gap-2">
            <StatusBadge status={client.status} />
            {!editing && (
              <Button size="sm" variant="ghost" onClick={startEditing}>
                <Pencil className="h-3.5 w-3.5 mr-1" />
                Edit
              </Button>
            )}
          </div>
        </div>

        {editing ? (
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Name *</label>
                <input
                  className="w-full rounded border border-border bg-transparent px-2 py-1.5 text-sm outline-none"
                  value={editForm.name ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Email</label>
                <input
                  className="w-full rounded border border-border bg-transparent px-2 py-1.5 text-sm outline-none"
                  value={editForm.email ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">CNPJ</label>
                <input
                  className="w-full rounded border border-border bg-transparent px-2 py-1.5 text-sm outline-none"
                  value={editForm.cnpj ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, cnpj: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Phone</label>
                <input
                  className="w-full rounded border border-border bg-transparent px-2 py-1.5 text-sm outline-none"
                  value={editForm.phone ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Contact Name</label>
                <input
                  className="w-full rounded border border-border bg-transparent px-2 py-1.5 text-sm outline-none"
                  value={editForm.contactName ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, contactName: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Status</label>
                <select
                  className="w-full rounded border border-border bg-transparent px-2 py-1.5 text-sm outline-none"
                  value={editForm.status ?? "active"}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                >
                  {CLIENT_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Notes</label>
              <textarea
                className="w-full rounded border border-border bg-transparent px-2 py-1.5 text-sm outline-none min-h-[60px]"
                value={editForm.notes ?? ""}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={!editForm.name?.trim() || updateClient.isPending}>
                {updateClient.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
            {updateClient.isError && (
              <p className="text-xs text-destructive">Failed to update client.</p>
            )}
          </div>
        ) : (
          <div className="p-4">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {client.email && (
                <>
                  <dt className="text-muted-foreground">Email</dt>
                  <dd>{client.email}</dd>
                </>
              )}
              {client.cnpj && (
                <>
                  <dt className="text-muted-foreground">CNPJ</dt>
                  <dd>{client.cnpj}</dd>
                </>
              )}
              {client.phone && (
                <>
                  <dt className="text-muted-foreground">Phone</dt>
                  <dd>{client.phone}</dd>
                </>
              )}
              {client.contactName && (
                <>
                  <dt className="text-muted-foreground">Contact</dt>
                  <dd>{client.contactName}</dd>
                </>
              )}
              {client.notes && (
                <>
                  <dt className="text-muted-foreground">Notes</dt>
                  <dd className="col-span-1 whitespace-pre-wrap">{client.notes}</dd>
                </>
              )}
            </dl>
            {!client.email && !client.cnpj && !client.phone && !client.contactName && !client.notes && (
              <p className="text-sm text-muted-foreground">No additional details.</p>
            )}
          </div>
        )}
      </div>

      {/* Client Projects */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Linked Projects</h3>
          <Button size="sm" variant="outline" onClick={() => setLinkDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Link Project
          </Button>
        </div>

        {(clientProjects ?? []).length === 0 && (
          <EmptyState
            icon={FolderOpen}
            message="No projects linked to this client."
            action="Link Project"
            onAction={() => setLinkDialogOpen(true)}
          />
        )}

        {(clientProjects ?? []).length > 0 && (
          <div className="border border-border rounded-lg divide-y divide-border">
            {clientProjects!.map((cp: ClientProject) => (
              <div key={cp.id} className="p-3 hover:bg-accent/30 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">
                        {cp.projectNameOverride || cp.projectName || "Unnamed project"}
                      </span>
                      <StatusBadge status={cp.status} />
                      {cp.projectType && (
                        <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                          {cp.projectType}
                        </span>
                      )}
                    </div>
                    {cp.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{cp.description}</p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      {cp.billingType && (
                        <span>{cp.billingType === "monthly" ? "Monthly" : "One-time"}: {formatCurrency(cp.amountCents)}</span>
                      )}
                      {cp.startDate && <span>Start: {formatDate(cp.startDate)}</span>}
                      {cp.endDate && <span>End: {formatDate(cp.endDate)}</span>}
                      {cp.lastPaymentAt && <span>Last payment: {formatDate(cp.lastPaymentAt)}</span>}
                    </div>
                    {cp.tags.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {cp.tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => deleteClientProject.mutate(cp.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <LinkClientProjectDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        clientId={clientId!}
        companyId={selectedCompanyId!}
      />
    </div>
  );
}
