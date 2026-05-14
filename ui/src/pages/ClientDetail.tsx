import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ClientEmployee, ClientProject } from "@paperclipai/shared";
import { CLIENT_STATUSES } from "@paperclipai/shared";
import { clientsApi } from "../api/clients";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { projectUrl } from "../lib/utils";
import { statusBadge, statusBadgeDefault } from "../lib/status-colors";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { PageTabBar } from "../components/PageTabBar";
import { LinkClientProjectDialog } from "../components/LinkClientProjectDialog";
import { InstructionsBundleEditor } from "../components/InstructionsBundleEditor";
import { InlineEditor } from "../components/InlineEditor";
import { DraftInput } from "../components/agent-config-primitives";
import { StatusBadge } from "../components/StatusBadge";
import { Card, CardHeader, CardTitle, CardContent, CardAction } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FolderOpen, Mail, Pencil, Plus, Trash2, UserRound, X } from "lucide-react";
import type { ReactNode } from "react";

type ClientDetailTab = "overview" | "identity" | "employees" | "projects" | "instructions";

function PropertyRow({
  label,
  children,
  alignStart = false,
}: {
  label: ReactNode;
  children: ReactNode;
  alignStart?: boolean;
}) {
  return (
    <div className={cn("flex gap-3 py-1.5 items-start")}>
      <div className="shrink-0 w-28 mt-0.5 text-xs text-muted-foreground">{label}</div>
      <div className={cn("min-w-0 flex-1 text-sm", alignStart ? "pt-0.5" : "flex items-center gap-1.5 flex-wrap")}>
        {children}
      </div>
    </div>
  );
}

function ClientStatusPicker({
  status,
  onChange,
}: {
  status: string;
  onChange: (status: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const colorClass = statusBadge[status] ?? statusBadgeDefault;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer hover:opacity-80 transition-opacity",
            colorClass,
          )}
        >
          {status.replace("_", " ")}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-36 p-1" align="start">
        {CLIENT_STATUSES.map((s) => (
          <Button
            key={s}
            variant="ghost"
            size="sm"
            className={cn("w-full justify-start gap-2 text-xs", s === status && "bg-accent")}
            onClick={() => {
              onChange(s);
              setOpen(false);
            }}
          >
            {s}
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function displayClientProjectName(project: ClientProject) {
  return project.projectNameOverride || project.projectName || "Unnamed project";
}

interface ClientEmployeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  linkedProjects: ClientProject[];
  editingEmployee?: ClientEmployee | null;
  pending: boolean;
  error: Error | null;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
}

function ClientEmployeeDialog({
  open,
  onOpenChange,
  linkedProjects,
  editingEmployee,
  pending,
  error,
  onSubmit,
}: ClientEmployeeDialogProps) {
  const mode = editingEmployee ? "edit" : "create";
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [projectScope, setProjectScope] = useState<"all_linked_projects" | "selected_projects">("all_linked_projects");
  const [selectedClientProjectIds, setSelectedClientProjectIds] = useState<string[]>([]);

  function reset() {
    setName("");
    setRole("");
    setEmail("");
    setProjectScope("all_linked_projects");
    setSelectedClientProjectIds([]);
  }

  useEffect(() => {
    if (!open) return;
    if (!editingEmployee) {
      reset();
      return;
    }
    setName(editingEmployee.name);
    setRole(editingEmployee.role);
    setEmail(editingEmployee.email);
    setProjectScope(editingEmployee.projectScope);
    setSelectedClientProjectIds(editingEmployee.projectLinks.map((link) => link.clientProjectId));
  }, [open, editingEmployee]);

  function toggleClientProject(clientProjectId: string) {
    setSelectedClientProjectIds((current) =>
      current.includes(clientProjectId)
        ? current.filter((id) => id !== clientProjectId)
        : [...current, clientProjectId],
    );
  }

  async function handleSubmit() {
    const trimmedName = name.trim();
    const trimmedRole = role.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName || !trimmedRole || !trimmedEmail) return;
    if (projectScope === "selected_projects" && selectedClientProjectIds.length === 0) return;
    await onSubmit({
      name: trimmedName,
      role: trimmedRole,
      email: trimmedEmail,
      projectScope,
      clientProjectIds: projectScope === "selected_projects" ? selectedClientProjectIds : [],
    });
    reset();
    onOpenChange(false);
  }

  const selectedScopeDisabled = linkedProjects.length === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) reset();
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent showCloseButton={false} className="p-0 gap-0 sm:max-w-lg">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="text-sm text-muted-foreground">
            {mode === "edit" ? "Edit Employee" : "Add Employee"}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
            aria-label="Close"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="space-y-4 px-4 py-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ana Silva" />
            </div>
            <div className="space-y-2">
              <Label>Role *</Label>
              <Input value={role} onChange={(event) => setRole(event.target.value)} placeholder="TI, User, Director" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Dedicated email *</Label>
            <Input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ana@client.com" />
          </div>

          <div className="space-y-2">
            <Label>Project relation</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                className={cn(
                  "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                  projectScope === "all_linked_projects" ? "border-primary bg-primary/10" : "border-border hover:bg-accent/50",
                )}
                onClick={() => setProjectScope("all_linked_projects")}
              >
                All linked projects
              </button>
              <button
                type="button"
                disabled={selectedScopeDisabled}
                className={cn(
                  "rounded-md border px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  projectScope === "selected_projects" ? "border-primary bg-primary/10" : "border-border hover:bg-accent/50",
                )}
                onClick={() => {
                  if (!selectedScopeDisabled) setProjectScope("selected_projects");
                }}
              >
                Selected projects
              </button>
            </div>
          </div>

          {projectScope === "selected_projects" ? (
            <div className="space-y-2 rounded-md border border-border p-3">
              {linkedProjects.length === 0 ? (
                <p className="text-xs text-muted-foreground">Link projects before selecting employee projects.</p>
              ) : (
                linkedProjects.map((project) => (
                  <label key={project.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={selectedClientProjectIds.includes(project.id)}
                      onCheckedChange={() => toggleClientProject(project.id)}
                    />
                    <span className="min-w-0 truncate">{displayClientProjectName(project)}</span>
                  </label>
                ))
              )}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
          {error ? (
            <p className="text-xs text-destructive">{error.message || "Failed to save employee."}</p>
          ) : (
            <span />
          )}
          <Button
            size="sm"
            disabled={
              pending
              || !name.trim()
              || !role.trim()
              || !email.trim()
              || (projectScope === "selected_projects" && selectedClientProjectIds.length === 0)
            }
            onClick={() => void handleSubmit()}
          >
            {pending ? "Saving..." : mode === "edit" ? "Save Changes" : "Add Employee"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ClientDetail() {
  const { clientId } = useParams<{ clientId: string }>();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<ClientDetailTab>("overview");
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ClientProject | null>(null);
  const [employeeDialogOpen, setEmployeeDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<ClientEmployee | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [selectedInstructionsFile, setSelectedInstructionsFile] = useState("CLIENT.md");
  const [emailDomainInput, setEmailDomainInput] = useState("");

  useEffect(() => {
    setSelectedInstructionsFile("CLIENT.md");
  }, [clientId]);

  const { data: client, isLoading } = useQuery({
    queryKey: queryKeys.clients.detail(clientId!),
    queryFn: () => clientsApi.get(clientId!),
    enabled: !!clientId,
  });

  const {
    data: clientProjects,
    isLoading: projectsLoading,
  } = useQuery({
    queryKey: queryKeys.clients.projects(clientId!),
    queryFn: () => clientsApi.listProjects(clientId!),
    enabled: !!clientId && (activeTab === "projects" || activeTab === "employees" || employeeDialogOpen),
  });

  const {
    data: clientEmployees,
    isLoading: employeesLoading,
  } = useQuery({
    queryKey: queryKeys.clients.employees(clientId!),
    queryFn: () => clientsApi.listEmployees(clientId!),
    enabled: !!clientId && activeTab === "employees",
  });

  const {
    data: emailDomains,
    isLoading: emailDomainsLoading,
  } = useQuery({
    queryKey: queryKeys.clients.emailDomains(clientId!),
    queryFn: () => clientsApi.listEmailDomains(clientId!),
    enabled: !!clientId && activeTab === "identity",
  });

  const {
    data: instructionsBundle,
    isLoading: instructionsLoading,
  } = useQuery({
    queryKey: queryKeys.clients.instructionsBundle(clientId!),
    queryFn: () => clientsApi.instructionsBundle(clientId!),
    enabled: !!clientId && activeTab === "instructions",
  });

  const { data: instructionsFileDetail, isLoading: instructionsFileLoading } = useQuery({
    queryKey: queryKeys.clients.instructionsFile(clientId!, selectedInstructionsFile),
    queryFn: () => clientsApi.instructionsFile(clientId!, selectedInstructionsFile),
    enabled:
      !!clientId
      && activeTab === "instructions"
      && !!instructionsBundle?.files.some((file) => file.path === selectedInstructionsFile),
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
    },
  });

  const deleteClient = useMutation({
    mutationFn: () => clientsApi.remove(clientId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.list(selectedCompanyId!) });
      navigate("/clients");
    },
  });

  const deleteClientProject = useMutation({
    mutationFn: (id: string) => clientsApi.removeProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.projects(clientId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.detail(clientId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.list(selectedCompanyId!) });
    },
  });

  const createEmailDomain = useMutation({
    mutationFn: (domain: string) => clientsApi.createEmailDomain(clientId!, domain),
    onSuccess: () => {
      setEmailDomainInput("");
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.emailDomains(clientId!) });
    },
  });

  const deleteEmailDomain = useMutation({
    mutationFn: (id: string) => clientsApi.removeEmailDomain(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.emailDomains(clientId!) });
    },
  });

  const createEmployee = useMutation({
    mutationFn: (data: Record<string, unknown>) => clientsApi.createEmployee(clientId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.employees(clientId!) });
    },
  });

  const updateEmployee = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      clientsApi.updateEmployee(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.employees(clientId!) });
    },
  });

  const deleteEmployee = useMutation({
    mutationFn: (id: string) => clientsApi.removeEmployee(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.employees(clientId!) });
    },
  });

  const saveInstructionsFile = useMutation({
    mutationFn: (data: { path: string; content: string }) =>
      clientsApi.saveInstructionsFile(clientId!, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.instructionsBundle(clientId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.instructionsFile(clientId!, variables.path) });
    },
  });

  const deleteInstructionsFile = useMutation({
    mutationFn: (relativePath: string) =>
      clientsApi.deleteInstructionsFile(clientId!, relativePath),
    onSuccess: (_, relativePath) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.instructionsBundle(clientId!) });
      queryClient.removeQueries({ queryKey: queryKeys.clients.instructionsFile(clientId!, relativePath) });
    },
  });

  if (isLoading || !client) {
    return <PageSkeleton variant="detail" />;
  }
  const currentClient = client;

  const commit = (data: Record<string, unknown>) => updateClient.mutate(data);
  const commitMeta = (patch: Record<string, unknown>) =>
    commit({ metadata: { ...(currentClient.metadata ?? {}), ...patch } });
  const addEmailDomain = () => {
    const value = emailDomainInput.trim();
    if (!value) return;
    createEmailDomain.mutate(value);
  };

  return (
    <div className="space-y-6 max-w-4xl">

      {/* Page header */}
      <div className="min-w-0">
        <InlineEditor
          value={currentClient.name}
          onSave={(name) => commit({ name: name.trim() })}
          as="h2"
          className="text-xl font-bold"
        />
        <p className="text-sm text-muted-foreground mt-1">Client relationship record</p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ClientDetailTab)}>
        <PageTabBar
          items={[
            { value: "overview", label: "Overview" },
            { value: "identity", label: "Identity" },
            { value: "employees", label: "Employees" },
            { value: "projects", label: "Projects" },
            { value: "instructions", label: "Instructions" },
          ]}
          align="start"
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as ClientDetailTab)}
        />

        {/* Overview tab */}
        <TabsContent value="overview" className="space-y-0 mt-4">
          <div className="space-y-1 pb-4">
            <PropertyRow label="Status">
              <ClientStatusPicker
                status={currentClient.status}
                onChange={(status) => commit({ status })}
              />
            </PropertyRow>
            <PropertyRow label="Contact">
              <DraftInput
                value={currentClient.contactName ?? ""}
                onCommit={(contactName) => commit({ contactName: contactName.trim() || null })}
                className="w-full rounded border border-border bg-transparent px-2 py-1 text-sm outline-none"
                placeholder="Primary contact name"
              />
            </PropertyRow>
            <PropertyRow label="Email">
              <DraftInput
                value={currentClient.email ?? ""}
                onCommit={(email) => commit({ email: email.trim() || null })}
                className="w-full rounded border border-border bg-transparent px-2 py-1 text-sm outline-none"
                placeholder="contact@example.com"
              />
            </PropertyRow>
            <PropertyRow label="Phone">
              <DraftInput
                value={currentClient.phone ?? ""}
                onCommit={(phone) => commit({ phone: phone.trim() || null })}
                className="w-full rounded border border-border bg-transparent px-2 py-1 text-sm outline-none"
                placeholder="+1 (555) 000-0000"
              />
            </PropertyRow>
            <PropertyRow label="CNPJ">
              <DraftInput
                value={currentClient.metadata?.cnpj ?? ""}
                onCommit={(cnpj) => commitMeta({ cnpj: cnpj.trim() || undefined })}
                className="w-full rounded border border-border bg-transparent px-2 py-1 text-sm outline-none"
                placeholder="00.000.000/0000-00"
              />
            </PropertyRow>
            <PropertyRow label="Notes" alignStart>
              <InlineEditor
                value={currentClient.notes ?? ""}
                onSave={(notes) => commit({ notes: notes.trim() || null })}
                nullable
                as="p"
                className="text-sm text-muted-foreground"
                placeholder="Add relationship notes..."
                multiline
              />
            </PropertyRow>
          </div>
        </TabsContent>

        {/* Identity tab */}
        <TabsContent value="identity" className="space-y-6 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Accepted Email Domains</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={emailDomainInput}
                  onChange={(event) => setEmailDomainInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addEmailDomain();
                    }
                  }}
                  placeholder="X@client.com or client.com"
                />
                <Button
                  size="sm"
                  onClick={addEmailDomain}
                  disabled={!emailDomainInput.trim() || createEmailDomain.isPending}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>
              {createEmailDomain.isError ? (
                <p className="text-xs text-destructive">
                  {(createEmailDomain.error as Error).message || "Failed to add email domain."}
                </p>
              ) : null}

              {emailDomainsLoading ? <PageSkeleton variant="list" /> : null}

              {!emailDomainsLoading && (emailDomains ?? []).length === 0 ? (
                <EmptyState
                  icon={Mail}
                  message="No accepted email domains registered for this client."
                />
              ) : null}

              {!emailDomainsLoading && (emailDomains ?? []).length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {emailDomains!.map((entry) => (
                    <span
                      key={entry.id}
                      className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-xs font-mono"
                    >
                      {entry.domain}
                      <button
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => deleteEmailDomain.mutate(entry.id)}
                        disabled={deleteEmailDomain.isPending}
                        aria-label={`Remove ${entry.domain}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Employees tab */}
        <TabsContent value="employees" className="space-y-6 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Client Employees</CardTitle>
              <CardAction>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingEmployee(null);
                    setEmployeeDialogOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Employee
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {employeesLoading ? <PageSkeleton variant="list" /> : null}

              {!employeesLoading && (clientEmployees ?? []).length === 0 ? (
                <EmptyState
                  icon={UserRound}
                  message="No client employees registered."
                  action="Add Employee"
                  onAction={() => {
                    setEditingEmployee(null);
                    setEmployeeDialogOpen(true);
                  }}
                />
              ) : null}

              {!employeesLoading && (clientEmployees ?? []).length > 0 ? (
                <div className="rounded-lg border border-border divide-y divide-border">
                  {clientEmployees!.map((employee) => (
                    <div key={employee.id} className="flex items-start justify-between gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{employee.name}</span>
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">{employee.role}</span>
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{employee.email}</span>
                          <span>
                            {employee.projectScope === "all_linked_projects"
                              ? "All linked projects"
                              : employee.projectLinks.map((link) => link.projectNameOverride || link.projectName || "Unnamed project").join(", ")}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setEditingEmployee(employee);
                            setEmployeeDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => deleteEmployee.mutate(employee.id)}
                          disabled={deleteEmployee.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Projects tab */}
        <TabsContent value="projects" className="space-y-6 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Linked Projects</CardTitle>
              <CardAction>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingProject(null);
                    setLinkDialogOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Link Project
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {projectsLoading ? (
                <PageSkeleton variant="list" />
              ) : null}

              {!projectsLoading && (clientProjects ?? []).length === 0 ? (
                <EmptyState
                  icon={FolderOpen}
                  message="No projects linked to this client."
                  action="Link Project"
                  onAction={() => {
                    setEditingProject(null);
                    setLinkDialogOpen(true);
                  }}
                />
              ) : null}

              {!projectsLoading && (clientProjects ?? []).length > 0 ? (
                <div className="rounded-lg border border-border divide-y divide-border">
                  {clientProjects!.map((project) => (
                    <div key={project.id} className="flex items-start justify-between gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <Link
                            to={projectUrl({
                              id: project.projectId,
                              name: project.projectName ?? project.projectNameOverride ?? "project",
                            })}
                            className="truncate text-sm font-medium hover:underline"
                          >
                            {project.projectNameOverride || project.projectName || "Unnamed project"}
                          </Link>
                          <StatusBadge status={project.status} />
                        </div>
                        {project.description ? (
                          <p className="text-sm text-muted-foreground">{project.description}</p>
                        ) : null}
                        {(project.tags ?? []).length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {project.tags.map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {(project.projectAliases ?? []).length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {project.projectAliases.map((alias) => (
                              <span
                                key={alias}
                                className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground"
                              >
                                {alias}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setEditingProject(project);
                            setLinkDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => deleteClientProject.mutate(project.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Instructions tab */}
        <TabsContent value="instructions" className="space-y-6 mt-4">
          <InstructionsBundleEditor
            title="Client Instructions"
            description="Markdown files applied when agents run work for projects linked to this client. The entry file (CLIENT.md) is included alongside company and agent instructions."
            files={instructionsBundle?.files ?? []}
            entryFile={instructionsBundle?.entryFile ?? "CLIENT.md"}
            loading={instructionsLoading}
            fileDetail={instructionsFileDetail}
            fileLoading={instructionsFileLoading}
            savePending={saveInstructionsFile.isPending}
            deletePending={deleteInstructionsFile.isPending}
            selectedFile={selectedInstructionsFile}
            onSelectedFileChange={setSelectedInstructionsFile}
            emptyMessage="No client instructions yet. Create a CLIENT.md file to add per-client instructions for linked project runs."
            emptyAction="Create CLIENT.md"
            emptyFilePath="CLIENT.md"
            emptyFileContent=""
            editorHeight="32rem"
            onSaveFile={(data, opts) => {
              saveInstructionsFile.mutate(data, {
                onSuccess: () => {
                  opts?.onSuccess?.();
                },
              });
            }}
            onDeleteFile={(relativePath) => deleteInstructionsFile.mutate(relativePath)}
          />
        </TabsContent>
      </Tabs>

      {/* Danger Zone */}
      <Separator className="my-4" />
      <div className="space-y-4 py-4">
        <div className="text-xs font-medium text-destructive uppercase tracking-wide">
          Danger Zone
        </div>
        <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-4">
          <p className="text-sm text-muted-foreground">
            Permanently delete this client and all linked project relationships. This cannot be undone.
          </p>
          {!confirmDelete ? (
            <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-3 w-3 mr-1" />
              Delete client
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-destructive">
                Delete &ldquo;{currentClient.name}&rdquo;?
              </span>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => deleteClient.mutate()}
                disabled={deleteClient.isPending}
              >
                {deleteClient.isPending ? "Deleting..." : "Confirm"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmDelete(false)}
                disabled={deleteClient.isPending}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      </div>

      <LinkClientProjectDialog
        open={linkDialogOpen}
        onOpenChange={(open) => {
          setLinkDialogOpen(open);
          if (!open) setEditingProject(null);
        }}
        clientId={clientId!}
        companyId={selectedCompanyId!}
        editingProject={editingProject ?? undefined}
      />
      <ClientEmployeeDialog
        open={employeeDialogOpen}
        onOpenChange={(open) => {
          setEmployeeDialogOpen(open);
          if (!open) setEditingEmployee(null);
        }}
        linkedProjects={clientProjects ?? []}
        editingEmployee={editingEmployee}
        pending={createEmployee.isPending || updateEmployee.isPending}
        error={(createEmployee.error ?? updateEmployee.error) as Error | null}
        onSubmit={async (data) => {
          if (editingEmployee) {
            await updateEmployee.mutateAsync({ id: editingEmployee.id, data });
          } else {
            await createEmployee.mutateAsync(data);
          }
        }}
      />
    </div>
  );
}
