import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ClientProject } from "@paperclipai/shared";
import { clientsApi } from "../api/clients";
import { projectsApi } from "../api/projects";
import { queryKeys } from "../lib/queryKeys";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useInvalidatingMutation } from "../lib/useInvalidatingMutation";

interface LinkClientProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  companyId: string;
  editingProject?: ClientProject;
}

export function LinkClientProjectDialog({
  open,
  onOpenChange,
  clientId,
  companyId,
  editingProject,
}: LinkClientProjectDialogProps) {
  const mode = editingProject ? "edit" : "create";
  const formKey = `${open ? "open" : "closed"}:${editingProject?.id ?? "create"}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="p-0 gap-0 sm:max-w-lg">
        <LinkClientProjectDialogContent
          key={formKey}
          onOpenChange={onOpenChange}
          clientId={clientId}
          companyId={companyId}
          editingProject={editingProject}
          mode={mode}
        />
      </DialogContent>
    </Dialog>
  );
}

function LinkClientProjectDialogContent({
  onOpenChange,
  clientId,
  companyId,
  editingProject,
  mode,
}: Omit<LinkClientProjectDialogProps, "open"> & { mode: "create" | "edit" }) {
  const queryClient = useQueryClient();

  const [projectId, setProjectId] = useState(editingProject?.projectId ?? "");
  const [projectNameOverride, setProjectNameOverride] = useState(editingProject?.projectNameOverride ?? "");
  const [startDate, setStartDate] = useState(
    editingProject?.startDate ? new Date(editingProject.startDate).toISOString().slice(0, 10) : "",
  );
  const [endDate, setEndDate] = useState(
    editingProject?.endDate ? new Date(editingProject.endDate).toISOString().slice(0, 10) : "",
  );
  const [description, setDescription] = useState(editingProject?.description ?? "");
  const [tagsInput, setTagsInput] = useState("");
  const [tags, setTags] = useState<string[]>(() => editingProject?.tags ?? []);
  const [aliasInput, setAliasInput] = useState("");
  const [projectAliases, setProjectAliases] = useState<string[]>(() => editingProject?.projectAliases ?? []);

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(companyId),
    queryFn: () => projectsApi.list(companyId),
    enabled: !!companyId,
  });

  const createLink = useInvalidatingMutation({
    mutationFn: (data: Record<string, unknown>) => clientsApi.createProject(clientId, data),
  });

  const updateLink = useInvalidatingMutation({
    mutationFn: (data: Record<string, unknown>) => clientsApi.updateProject(editingProject!.id, data),
  });

  const activeMutation = mode === "edit" ? updateLink : createLink;

  function addUniqueValue(input: string, values: string[], setValues: (values: string[]) => void, normalize = false) {
    const value = normalize ? input.trim().toLowerCase() : input.trim();
    if (value && !values.some((current) => current.toLowerCase() === value.toLowerCase())) {
      setValues([...values, value]);
    }
  }

  function addTag() {
    addUniqueValue(tagsInput, tags, setTags, true);
    setTagsInput("");
  }

  function addAlias() {
    addUniqueValue(aliasInput, projectAliases, setProjectAliases);
    setAliasInput("");
  }

  function handleTagKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    }
  }

  function handleAliasKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addAlias();
    }
  }

  async function handleSubmit() {
    if (!projectId) return;
    try {
      const data: Record<string, unknown> = {};
      if (mode === "create") data.projectId = projectId;
      data.projectNameOverride = projectNameOverride.trim() || null;
      data.startDate = startDate || null;
      data.endDate = endDate || null;
      data.description = description.trim() || null;
      data.tags = tags;
      data.projectAliases = projectAliases;

      await activeMutation.mutateAsync(data);
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.projects(clientId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.detail(clientId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.list(companyId) });
      onOpenChange(false);
    } catch {
      // surfaced via mutation state
    }
  }

  const activeProjects = (projects ?? []).filter((project) => !project.archivedAt);

  return (
    <>
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="text-sm text-muted-foreground">
            {mode === "edit" ? "Edit Linked Project" : "Link Project"}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            <span className="text-lg leading-none">&times;</span>
          </Button>
        </div>

        <div className="space-y-3 px-4 py-3">
          <div className="space-y-2">
            <Label>Project *</Label>
            <Select value={projectId} onValueChange={setProjectId} disabled={mode === "edit"}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a project..." />
              </SelectTrigger>
              <SelectContent>
                {activeProjects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Display name override</Label>
              <Input
                placeholder="Optional client-facing label"
                value={projectNameOverride}
                onChange={(e) => setProjectNameOverride(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Start date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>End date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Client project aliases</Label>
            <Input
              placeholder="ABC, DFG..."
              value={aliasInput}
              onChange={(e) => setAliasInput(e.target.value)}
              onKeyDown={handleAliasKeyDown}
              onBlur={addAlias}
            />
            {projectAliases.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {projectAliases.map((alias) => (
                  <span
                    key={alias}
                    className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono"
                  >
                    {alias}
                    <button type="button"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => setProjectAliases(projectAliases.filter((currentAlias) => currentAlias !== alias))}
                    >
                      <X className="size-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              placeholder="How this project relates to the client, expectations, scope notes, or context..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Tags</Label>
            <Input
              placeholder="Type and press Enter..."
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              onBlur={addTag}
            />
            {tags.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono"
                  >
                    {tag}
                    <button type="button"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => setTags(tags.filter((currentTag) => currentTag !== tag))}
                    >
                      <X className="size-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
          {activeMutation.isError ? (
            <p className="text-xs text-destructive">
              {mode === "edit" ? "Failed to update project link." : "Failed to link project."}
            </p>
          ) : (
            <span />
          )}
          <Button size="sm" disabled={!projectId || activeMutation.isPending} onClick={handleSubmit}>
            {activeMutation.isPending
              ? mode === "edit"
                ? "Saving..."
                : "Linking..."
              : mode === "edit"
                ? "Save Changes"
                : "Link Project"}
          </Button>
        </div>
    </>
  );
}
