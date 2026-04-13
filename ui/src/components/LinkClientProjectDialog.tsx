import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CLIENT_PROJECT_TYPES, CLIENT_PROJECT_BILLING_TYPES } from "@paperclipai/shared";
import { clientsApi } from "../api/clients";
import { projectsApi } from "../api/projects";
import { queryKeys } from "../lib/queryKeys";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface LinkClientProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  companyId: string;
}

export function LinkClientProjectDialog({ open, onOpenChange, clientId, companyId }: LinkClientProjectDialogProps) {
  const queryClient = useQueryClient();

  const [projectId, setProjectId] = useState("");
  const [projectNameOverride, setProjectNameOverride] = useState("");
  const [projectType, setProjectType] = useState("");
  const [billingType, setBillingType] = useState("");
  const [amountCents, setAmountCents] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(companyId),
    queryFn: () => projectsApi.list(companyId),
    enabled: !!companyId && open,
  });

  const createLink = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      clientsApi.createProject(clientId, data),
  });

  function reset() {
    setProjectId("");
    setProjectNameOverride("");
    setProjectType("");
    setBillingType("");
    setAmountCents("");
    setStartDate("");
    setEndDate("");
    setDescription("");
    setTagsInput("");
    setTags([]);
  }

  function addTag() {
    const tag = tagsInput.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
    }
    setTagsInput("");
  }

  function handleTagKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    }
  }

  async function handleSubmit() {
    if (!projectId) return;
    try {
      const data: Record<string, unknown> = { projectId };
      if (projectNameOverride.trim()) data.projectNameOverride = projectNameOverride.trim();
      if (projectType) data.projectType = projectType;
      if (billingType) data.billingType = billingType;
      if (amountCents) data.amountCents = Math.round(parseFloat(amountCents) * 100);
      if (startDate) data.startDate = startDate;
      if (endDate) data.endDate = endDate;
      if (description.trim()) data.description = description.trim();
      if (tags.length > 0) data.tags = tags;

      await createLink.mutateAsync(data);
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.projects(clientId) });
      reset();
      onOpenChange(false);
    } catch {
      // error surfaced via createLink.isError
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent showCloseButton={false} className="p-0 gap-0 sm:max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <span className="text-sm text-muted-foreground">Link Project</span>
          <Button variant="ghost" size="icon-xs" className="text-muted-foreground" onClick={() => { reset(); onOpenChange(false); }}>
            <span className="text-lg leading-none">&times;</span>
          </Button>
        </div>

        <div className="px-4 py-3 space-y-3">
          {/* Project selector */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Project *</label>
            <select
              className="w-full rounded border border-border bg-transparent px-2 py-1.5 text-sm outline-none"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">Select a project...</option>
              {(projects ?? []).filter((p) => !p.archivedAt).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Display Name Override</label>
              <input
                className="w-full rounded border border-border bg-transparent px-2 py-1.5 text-sm outline-none"
                placeholder="Custom project name"
                value={projectNameOverride}
                onChange={(e) => setProjectNameOverride(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Project Type</label>
              <select
                className="w-full rounded border border-border bg-transparent px-2 py-1.5 text-sm outline-none"
                value={projectType}
                onChange={(e) => setProjectType(e.target.value)}
              >
                <option value="">None</option>
                {CLIENT_PROJECT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Billing Type</label>
              <select
                className="w-full rounded border border-border bg-transparent px-2 py-1.5 text-sm outline-none"
                value={billingType}
                onChange={(e) => setBillingType(e.target.value)}
              >
                <option value="">None</option>
                {CLIENT_PROJECT_BILLING_TYPES.map((t) => (
                  <option key={t} value={t}>{t === "monthly" ? "Monthly" : "One-time"}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Amount (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="w-full rounded border border-border bg-transparent px-2 py-1.5 text-sm outline-none"
                placeholder="0.00"
                value={amountCents}
                onChange={(e) => setAmountCents(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Start Date</label>
              <input
                type="date"
                className="w-full rounded border border-border bg-transparent px-2 py-1.5 text-sm outline-none"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">End Date</label>
              <input
                type="date"
                className="w-full rounded border border-border bg-transparent px-2 py-1.5 text-sm outline-none"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">Description</label>
            <textarea
              className="w-full rounded border border-border bg-transparent px-2 py-1.5 text-sm outline-none min-h-[50px]"
              placeholder="Project summary..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Tags (tech stack)</label>
            <div className="flex items-center gap-2">
              <input
                className="flex-1 rounded border border-border bg-transparent px-2 py-1.5 text-sm outline-none"
                placeholder="Type and press Enter..."
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                onBlur={addTag}
              />
            </div>
            {tags.length > 0 && (
              <div className="flex gap-1 flex-wrap mt-1.5">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono"
                  >
                    {tag}
                    <button
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => setTags(tags.filter((t) => t !== tag))}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border">
          {createLink.isError ? (
            <p className="text-xs text-destructive">Failed to link project.</p>
          ) : (
            <span />
          )}
          <Button
            size="sm"
            disabled={!projectId || createLink.isPending}
            onClick={handleSubmit}
          >
            {createLink.isPending ? "Linking..." : "Link project"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
