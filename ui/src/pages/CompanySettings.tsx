import { ChangeEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_COMPANY_ATTACHMENT_MAX_BYTES,
  MAX_COMPANY_ATTACHMENT_MAX_BYTES,
} from "@paperclipai/shared";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { companiesApi } from "../api/companies";
import { accessApi } from "../api/access";
import { assetsApi } from "../api/assets";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Settings, Check, Download, Upload, Mail } from "lucide-react";
import { CompanyPatternIcon } from "../components/CompanyPatternIcon";
import {
  Field,
  ToggleField,
  HintIcon,
} from "../components/agent-config-primitives";

type AgentSnippetInput = {
  onboardingTextUrl: string;
  connectionCandidates?: string[] | null;
  testResolutionUrl?: string | null;
};

const BYTES_PER_MIB = 1024 * 1024;
const DEFAULT_COMPANY_ATTACHMENT_MAX_MIB = DEFAULT_COMPANY_ATTACHMENT_MAX_BYTES / BYTES_PER_MIB;
const MAX_COMPANY_ATTACHMENT_MAX_MIB = MAX_COMPANY_ATTACHMENT_MAX_BYTES / BYTES_PER_MIB;
export function CompanySettings() {
  const {
    companies,
    selectedCompany,
    selectedCompanyId,
    setSelectedCompanyId
  } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  // General settings local state
  const [companyName, setCompanyName] = useState("");
  const [description, setDescription] = useState("");
  const [brandColor, setBrandColor] = useState("");
  const [attachmentMaxMiB, setAttachmentMaxMiB] = useState(String(DEFAULT_COMPANY_ATTACHMENT_MAX_MIB));
  const [logoUrl, setLogoUrl] = useState("");
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);

  // Email (SMTP) settings local state
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpPasswordTouched, setSmtpPasswordTouched] = useState(false);
  const [emailSignatureHtml, setEmailSignatureHtml] = useState("");
  const [inboundName, setInboundName] = useState("Support inbox");
  const [inboundEnabled, setInboundEnabled] = useState(false);
  const [inboundHost, setInboundHost] = useState("");
  const [inboundPort, setInboundPort] = useState("993");
  const [inboundUsername, setInboundUsername] = useState("");
  const [inboundPassword, setInboundPassword] = useState("");
  const [inboundPasswordTouched, setInboundPasswordTouched] = useState(false);
  const [inboundFolder, setInboundFolder] = useState("INBOX");
  const [inboundTls, setInboundTls] = useState(true);
  const [inboundPollIntervalSeconds, setInboundPollIntervalSeconds] = useState("60");

  const inboundMailboxesQuery = useQuery({
    queryKey: ["companies", selectedCompanyId, "inbound-email", "mailboxes"],
    queryFn: () => companiesApi.listInboundEmailMailboxes(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });
  const inboundMessagesQuery = useQuery({
    queryKey: ["companies", selectedCompanyId, "inbound-email", "messages"],
    queryFn: () => companiesApi.listInboundEmailMessages(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });

  // Sync local state from selected company
  useEffect(() => {
    if (!selectedCompany) return;
    setCompanyName(selectedCompany.name);
    setDescription(selectedCompany.description ?? "");
    setBrandColor(selectedCompany.brandColor ?? "");
    setAttachmentMaxMiB(String(Math.round((selectedCompany.attachmentMaxBytes ?? DEFAULT_COMPANY_ATTACHMENT_MAX_BYTES) / BYTES_PER_MIB)));
    setLogoUrl(selectedCompany.logoUrl ?? "");
    setSmtpHost(selectedCompany.smtpHost ?? "");
    setSmtpPort(selectedCompany.smtpPort != null ? String(selectedCompany.smtpPort) : "");
    setSmtpUser(selectedCompany.smtpUser ?? "");
    setSmtpFrom(selectedCompany.smtpFrom ?? "");
    setSmtpPassword("");
    setSmtpPasswordTouched(false);
    setEmailSignatureHtml(selectedCompany.emailSignatureHtml ?? "");
  }, [selectedCompany]);

  const primaryInboundMailbox = inboundMailboxesQuery.data?.[0] ?? null;

  useEffect(() => {
    if (!primaryInboundMailbox) {
      setInboundName("Support inbox");
      setInboundEnabled(false);
      setInboundHost("");
      setInboundPort("993");
      setInboundUsername("");
      setInboundPassword("");
      setInboundPasswordTouched(false);
      setInboundFolder("INBOX");
      setInboundTls(true);
      setInboundPollIntervalSeconds("60");
      return;
    }
    setInboundName(primaryInboundMailbox.name);
    setInboundEnabled(primaryInboundMailbox.enabled);
    setInboundHost(primaryInboundMailbox.host);
    setInboundPort(String(primaryInboundMailbox.port));
    setInboundUsername(primaryInboundMailbox.username);
    setInboundPassword("");
    setInboundPasswordTouched(false);
    setInboundFolder(primaryInboundMailbox.folder);
    setInboundTls(primaryInboundMailbox.tls);
    setInboundPollIntervalSeconds(String(primaryInboundMailbox.pollIntervalSeconds));
  }, [primaryInboundMailbox?.id]);

  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSnippet, setInviteSnippet] = useState<string | null>(null);
  const [snippetCopied, setSnippetCopied] = useState(false);
  const [snippetCopyDelightId, setSnippetCopyDelightId] = useState(0);

  const attachmentMaxBytes = Number.parseInt(attachmentMaxMiB, 10) * BYTES_PER_MIB;
  const attachmentMaxValid =
    Number.isInteger(attachmentMaxBytes)
    && attachmentMaxBytes >= BYTES_PER_MIB
    && attachmentMaxBytes <= MAX_COMPANY_ATTACHMENT_MAX_BYTES;

  const generalDirty =
    !!selectedCompany &&
    (companyName !== selectedCompany.name ||
      description !== (selectedCompany.description ?? "") ||
      brandColor !== (selectedCompany.brandColor ?? "") ||
      attachmentMaxBytes !== (selectedCompany.attachmentMaxBytes ?? DEFAULT_COMPANY_ATTACHMENT_MAX_BYTES));

  const generalMutation = useMutation({
    mutationFn: (data: {
      name: string;
      description: string | null;
      brandColor: string | null;
      attachmentMaxBytes: number;
    }) => companiesApi.update(selectedCompanyId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    }
  });

  const smtpPortNum = smtpPort.trim() === "" ? null : Number(smtpPort);
  const smtpPortValid =
    smtpPort.trim() === "" ||
    (Number.isInteger(smtpPortNum) && smtpPortNum !== null && smtpPortNum >= 1 && smtpPortNum <= 65535);
  const smtpDirty =
    !!selectedCompany &&
    (smtpHost !== (selectedCompany.smtpHost ?? "") ||
      (selectedCompany.smtpPort != null ? String(selectedCompany.smtpPort) : "") !== smtpPort ||
      smtpUser !== (selectedCompany.smtpUser ?? "") ||
      smtpFrom !== (selectedCompany.smtpFrom ?? "") ||
      smtpPasswordTouched);

  const smtpMutation = useMutation({
    mutationFn: () => {
      const payload: Parameters<typeof companiesApi.update>[1] = {
        smtpHost: smtpHost.trim() || null,
        smtpPort: smtpPortNum,
        smtpUser: smtpUser.trim() || null,
        smtpFrom: smtpFrom.trim() || null,
      };
      if (smtpPasswordTouched) {
        payload.smtpPassword = smtpPassword;
      }
      return companiesApi.update(selectedCompanyId!, payload);
    },
    onSuccess: () => {
      setSmtpPassword("");
      setSmtpPasswordTouched(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    },
  });

  const [testEmailTo, setTestEmailTo] = useState("");
  const testEmailTrimmed = testEmailTo.trim();
  const testEmailValid =
    testEmailTrimmed === "" ||
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmailTrimmed);
  const testEmailMutation = useMutation({
    mutationFn: () => companiesApi.testEmail(selectedCompanyId!, testEmailTrimmed),
  });

  const inboundPortNum = Number(inboundPort);
  const inboundPollIntervalNum = Number(inboundPollIntervalSeconds);
  const inboundValid =
    inboundName.trim().length > 0 &&
    inboundHost.trim().length > 0 &&
    inboundUsername.trim().length > 0 &&
    inboundFolder.trim().length > 0 &&
    Number.isInteger(inboundPortNum) &&
    inboundPortNum >= 1 &&
    inboundPortNum <= 65535 &&
    Number.isInteger(inboundPollIntervalNum) &&
    inboundPollIntervalNum >= 30 &&
    inboundPollIntervalNum <= 3600;
  const inboundDirty =
    !primaryInboundMailbox ||
    inboundName !== primaryInboundMailbox.name ||
    inboundEnabled !== primaryInboundMailbox.enabled ||
    inboundHost !== primaryInboundMailbox.host ||
    inboundPort !== String(primaryInboundMailbox.port) ||
    inboundUsername !== primaryInboundMailbox.username ||
    inboundFolder !== primaryInboundMailbox.folder ||
    inboundTls !== primaryInboundMailbox.tls ||
    inboundPollIntervalSeconds !== String(primaryInboundMailbox.pollIntervalSeconds) ||
    (inboundPasswordTouched && inboundPassword.trim().length > 0);
  const inboundSaveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: inboundName.trim(),
        provider: "imap" as const,
        enabled: inboundEnabled,
        host: inboundHost.trim(),
        port: inboundPortNum,
        username: inboundUsername.trim(),
        folder: inboundFolder.trim(),
        tls: inboundTls,
        pollIntervalSeconds: inboundPollIntervalNum,
        targetProjectId: primaryInboundMailbox?.targetProjectId ?? null,
        createMode: primaryInboundMailbox?.createMode ?? ("issue" as const),
        markSeen: primaryInboundMailbox?.markSeen ?? true,
        ...(inboundPasswordTouched && inboundPassword.trim().length > 0 ? { password: inboundPassword } : {}),
      };
      return companiesApi.saveInboundEmailMailbox(selectedCompanyId!, primaryInboundMailbox?.id ?? null, payload);
    },
    onSuccess: () => {
      setInboundPassword("");
      setInboundPasswordTouched(false);
      queryClient.invalidateQueries({ queryKey: ["companies", selectedCompanyId, "inbound-email", "mailboxes"] });
    },
  });
  const inboundTestMutation = useMutation({
    mutationFn: () => companiesApi.testInboundEmailMailbox(selectedCompanyId!, primaryInboundMailbox!.id),
  });
  const inboundPollMutation = useMutation({
    mutationFn: () => companiesApi.pollInboundEmailMailbox(selectedCompanyId!, primaryInboundMailbox!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies", selectedCompanyId, "inbound-email", "messages"] });
    },
  });

  const emailSignatureDirty =
    !!selectedCompany &&
    emailSignatureHtml !== (selectedCompany.emailSignatureHtml ?? "");

  const emailSignatureMutation = useMutation({
    mutationFn: () =>
      companiesApi.update(selectedCompanyId!, {
        emailSignatureHtml: emailSignatureHtml.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    },
  });

  const settingsMutation = useMutation({
    mutationFn: (requireApproval: boolean) =>
      companiesApi.update(selectedCompanyId!, {
        requireBoardApprovalForNewAgents: requireApproval
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    }
  });

  const inviteMutation = useMutation({
    mutationFn: () =>
      accessApi.createOpenClawInvitePrompt(selectedCompanyId!),
    onSuccess: async (invite) => {
      setInviteError(null);
      const base = window.location.origin.replace(/\/+$/, "");
      const onboardingTextLink =
        invite.onboardingTextUrl ??
        invite.onboardingTextPath ??
        `/api/invites/${invite.token}/onboarding.txt`;
      const absoluteUrl = onboardingTextLink.startsWith("http")
        ? onboardingTextLink
        : `${base}${onboardingTextLink}`;
      setSnippetCopied(false);
      setSnippetCopyDelightId(0);
      let snippet: string;
      try {
        const manifest = await accessApi.getInviteOnboarding(invite.token);
        snippet = buildAgentSnippet({
          onboardingTextUrl: absoluteUrl,
          connectionCandidates:
            manifest.onboarding.connectivity?.connectionCandidates ?? null,
          testResolutionUrl:
            manifest.onboarding.connectivity?.testResolutionEndpoint?.url ??
            null
        });
      } catch {
        snippet = buildAgentSnippet({
          onboardingTextUrl: absoluteUrl,
          connectionCandidates: null,
          testResolutionUrl: null
        });
      }
      setInviteSnippet(snippet);
      try {
        await navigator.clipboard.writeText(snippet);
        setSnippetCopied(true);
        setSnippetCopyDelightId((prev) => prev + 1);
        setTimeout(() => setSnippetCopied(false), 2000);
      } catch {
        /* clipboard may not be available */
      }
      queryClient.invalidateQueries({
        queryKey: queryKeys.sidebarBadges(selectedCompanyId!)
      });
    },
    onError: (err) => {
      setInviteError(
        err instanceof Error ? err.message : "Failed to create invite"
      );
    }
  });

  const syncLogoState = (nextLogoUrl: string | null) => {
    setLogoUrl(nextLogoUrl ?? "");
    void queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
  };

  const logoUploadMutation = useMutation({
    mutationFn: (file: File) =>
      assetsApi
        .uploadCompanyLogo(selectedCompanyId!, file)
        .then((asset) => companiesApi.update(selectedCompanyId!, { logoAssetId: asset.assetId })),
    onSuccess: (company) => {
      syncLogoState(company.logoUrl);
      setLogoUploadError(null);
    }
  });

  const clearLogoMutation = useMutation({
    mutationFn: () => companiesApi.update(selectedCompanyId!, { logoAssetId: null }),
    onSuccess: (company) => {
      setLogoUploadError(null);
      syncLogoState(company.logoUrl);
    }
  });

  function handleLogoFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!file) return;
    setLogoUploadError(null);
    logoUploadMutation.mutate(file);
  }

  function handleClearLogo() {
    clearLogoMutation.mutate();
  }

  useEffect(() => {
    setInviteError(null);
    setInviteSnippet(null);
    setSnippetCopied(false);
    setSnippetCopyDelightId(0);
  }, [selectedCompanyId]);

  const archiveMutation = useMutation({
    mutationFn: ({
      companyId,
      nextCompanyId
    }: {
      companyId: string;
      nextCompanyId: string | null;
    }) => companiesApi.archive(companyId).then(() => ({ nextCompanyId })),
    onSuccess: async ({ nextCompanyId }) => {
      if (nextCompanyId) {
        setSelectedCompanyId(nextCompanyId);
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys.companies.all
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.companies.stats
      });
    }
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? "Company", href: "/dashboard" },
      { label: "Settings" }
    ]);
  }, [setBreadcrumbs, selectedCompany?.name]);

  if (!selectedCompany) {
    return (
      <div className="text-sm text-muted-foreground">
        No company selected. Select a company from the switcher above.
      </div>
    );
  }

  function handleSaveGeneral() {
    generalMutation.mutate({
      name: companyName.trim(),
      description: description.trim() || null,
      brandColor: brandColor || null,
      attachmentMaxBytes
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <Settings className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Company Settings</h1>
      </div>

      {/* General */}
      <div className="space-y-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          General
        </div>
        <div className="space-y-3 rounded-md border border-border px-4 py-4">
          <Field label="Company name" hint="The display name for your company.">
            <input
              className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </Field>
          <Field
            label="Description"
            hint="Optional description shown in the company profile."
          >
            <input
              className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
              type="text"
              value={description}
              placeholder="Optional company description"
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
        </div>
      </div>

      {/* Appearance */}
      <div className="space-y-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Appearance
        </div>
        <div className="space-y-3 rounded-md border border-border px-4 py-4">
          <div className="flex items-start gap-4">
            <div className="shrink-0">
              <CompanyPatternIcon
                companyName={companyName || selectedCompany.name}
                logoUrl={logoUrl || null}
                brandColor={brandColor || null}
                className="rounded-[14px]"
              />
            </div>
            <div className="flex-1 space-y-3">
              <Field
                label="Logo"
                hint="Upload a PNG, JPEG, WEBP, GIF, or SVG logo image."
              >
                <div className="space-y-2">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                    onChange={handleLogoFileChange}
                    className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none file:mr-4 file:rounded-md file:border-0 file:bg-muted file:px-2.5 file:py-1 file:text-xs"
                  />
                  {logoUrl && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleClearLogo}
                        disabled={clearLogoMutation.isPending}
                      >
                        {clearLogoMutation.isPending ? "Removing..." : "Remove logo"}
                      </Button>
                    </div>
                  )}
                  {(logoUploadMutation.isError || logoUploadError) && (
                    <span className="text-xs text-destructive">
                      {logoUploadError ??
                        (logoUploadMutation.error instanceof Error
                          ? logoUploadMutation.error.message
                          : "Logo upload failed")}
                    </span>
                  )}
                  {clearLogoMutation.isError && (
                    <span className="text-xs text-destructive">
                      {clearLogoMutation.error.message}
                    </span>
                  )}
                  {logoUploadMutation.isPending && (
                    <span className="text-xs text-muted-foreground">Uploading logo...</span>
                  )}
                </div>
              </Field>
              <Field
                label="Brand color"
                hint="Sets the hue for the company icon. Leave empty for auto-generated color."
              >
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={brandColor || "#6366f1"}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="h-8 w-8 cursor-pointer rounded border border-border bg-transparent p-0"
                  />
                  <input
                    type="text"
                    value={brandColor}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^#[0-9a-fA-F]{0,6}$/.test(v)) {
                        setBrandColor(v);
                      }
                    }}
                    placeholder="Auto"
                    className="w-28 rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm font-mono outline-none"
                  />
                  {brandColor && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setBrandColor("")}
                      className="text-xs text-muted-foreground"
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </Field>
              <Field
                label="Attachment size limit"
                hint={`Accepted range: 1-${MAX_COMPANY_ATTACHMENT_MAX_MIB} MiB.`}
              >
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={MAX_COMPANY_ATTACHMENT_MAX_MIB}
                      step={1}
                      value={attachmentMaxMiB}
                      onChange={(e) => setAttachmentMaxMiB(e.target.value)}
                      className="w-28 rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                    />
                    <span className="text-xs text-muted-foreground">MiB</span>
                  </div>
                  {!attachmentMaxValid && (
                    <span className="text-xs text-destructive">
                      Enter a whole number from 1 to {MAX_COMPANY_ATTACHMENT_MAX_MIB}.
                    </span>
                  )}
                </div>
              </Field>
            </div>
          </div>
        </div>
      </div>

      {/* Save button for General + Appearance */}
      {generalDirty && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleSaveGeneral}
            disabled={generalMutation.isPending || !companyName.trim() || !attachmentMaxValid}
          >
            {generalMutation.isPending ? "Saving..." : "Save changes"}
          </Button>
          {generalMutation.isSuccess && (
            <span className="text-xs text-muted-foreground">Saved</span>
          )}
          {generalMutation.isError && (
            <span className="text-xs text-destructive">
              {generalMutation.error instanceof Error
                  ? generalMutation.error.message
                  : "Failed to save"}
            </span>
          )}
        </div>
      )}

      {/* Email Notifications (SMTP) */}
      <div className="space-y-4" data-testid="company-settings-smtp-section">
        <div className="flex items-center gap-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Email Notifications
          </div>
          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div className="space-y-3 rounded-md border border-border px-4 py-4">
          <p className="text-xs text-muted-foreground">
            Per-company SMTP credentials used to send routine failure and remediation emails. Leave
            host empty to fall back to the server's environment variables.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="SMTP host" hint="Hostname of your SMTP server (e.g., smtp.gmail.com).">
              <input
                data-testid="company-settings-smtp-host"
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                type="text"
                value={smtpHost}
                placeholder="smtp.example.com"
                onChange={(e) => setSmtpHost(e.target.value)}
              />
            </Field>
            <Field label="Port" hint="Typically 587 (STARTTLS) or 465 (TLS).">
              <input
                data-testid="company-settings-smtp-port"
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                type="number"
                min={1}
                max={65535}
                value={smtpPort}
                placeholder="587"
                onChange={(e) => setSmtpPort(e.target.value)}
              />
            </Field>
            <Field label="From address" hint="The address routine emails are sent from.">
              <input
                data-testid="company-settings-smtp-from"
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                type="text"
                value={smtpFrom}
                placeholder="noreply@example.com"
                onChange={(e) => setSmtpFrom(e.target.value)}
              />
            </Field>
            <Field label="Username" hint="SMTP auth username (optional).">
              <input
                data-testid="company-settings-smtp-user"
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                type="text"
                value={smtpUser}
                autoComplete="off"
                onChange={(e) => setSmtpUser(e.target.value)}
              />
            </Field>
            <Field
              label="Password"
              hint={
                selectedCompany.smtpPasswordSet
                  ? "A password is configured. Type to replace it; leave blank to keep unchanged."
                  : "SMTP auth password. Stored encrypted."
              }
            >
              <input
                data-testid="company-settings-smtp-password"
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                type="password"
                value={smtpPassword}
                autoComplete="new-password"
                placeholder={selectedCompany.smtpPasswordSet ? "•••••••• (configured)" : ""}
                onChange={(e) => {
                  setSmtpPassword(e.target.value);
                  setSmtpPasswordTouched(true);
                }}
              />
            </Field>
          </div>
          {!smtpPortValid && (
            <span className="text-xs text-destructive">
              Port must be a whole number between 1 and 65535.
            </span>
          )}
          {smtpDirty && (
            <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center">
              <Button
                data-testid="company-settings-smtp-save"
                size="sm"
                className="w-full sm:w-auto"
                onClick={() => smtpMutation.mutate()}
                disabled={smtpMutation.isPending || !smtpPortValid}
              >
                {smtpMutation.isPending ? "Saving..." : "Save email settings"}
              </Button>
              {smtpMutation.isSuccess && (
                <span className="text-xs text-muted-foreground">Saved</span>
              )}
              {smtpMutation.isError && (
                <span className="min-w-0 break-words text-xs text-destructive">
                  {smtpMutation.error instanceof Error
                    ? smtpMutation.error.message
                    : "Failed to save"}
                </span>
              )}
            </div>
          )}
          <div className="space-y-2 border-t border-border pt-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                data-testid="company-settings-smtp-test-email"
                className="min-w-0 rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none sm:w-64"
                type="email"
                placeholder="Send test to..."
                value={testEmailTo}
                onChange={(e) => {
                  setTestEmailTo(e.target.value);
                  testEmailMutation.reset();
                }}
              />
              <Button
                data-testid="company-settings-smtp-test-send"
                size="sm"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => testEmailMutation.mutate()}
                disabled={testEmailMutation.isPending || !testEmailTrimmed || !testEmailValid}
              >
                {testEmailMutation.isPending ? "Sending..." : "Send test email"}
              </Button>
            </div>
            {!testEmailValid && (
              <span className="block text-xs text-destructive">
                Enter a valid email address before sending a test.
              </span>
            )}
            {testEmailMutation.isSuccess && (
              <span className="block text-xs text-muted-foreground">
                Test email sent to {testEmailTrimmed}.
              </span>
            )}
            {testEmailMutation.isError && (
              <span className="block min-w-0 break-words text-xs text-destructive">
                {testEmailMutation.error instanceof Error
                  ? testEmailMutation.error.message
                  : "Failed to send"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Inbound Email */}
      <div className="space-y-4" data-testid="company-settings-inbound-email-section">
        <div className="flex items-center gap-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Inbound Email
          </div>
          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div className="space-y-3 rounded-md border border-border px-4 py-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Mailbox name" hint="Local label for this inbound mailbox.">
              <input
                data-testid="company-settings-inbound-name"
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                type="text"
                value={inboundName}
                onChange={(e) => setInboundName(e.target.value)}
              />
            </Field>
            <Field label="IMAP host" hint="Mailbox server used for inbound polling.">
              <input
                data-testid="company-settings-inbound-host"
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                type="text"
                value={inboundHost}
                placeholder="imap.example.com"
                onChange={(e) => setInboundHost(e.target.value)}
              />
            </Field>
            <Field label="Port" hint="Usually 993 for TLS IMAP.">
              <input
                data-testid="company-settings-inbound-port"
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                type="number"
                min={1}
                max={65535}
                value={inboundPort}
                onChange={(e) => setInboundPort(e.target.value)}
              />
            </Field>
            <Field label="Username" hint="Mailbox username or email address.">
              <input
                data-testid="company-settings-inbound-username"
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                type="text"
                value={inboundUsername}
                autoComplete="off"
                onChange={(e) => setInboundUsername(e.target.value)}
              />
            </Field>
            <Field
              label="Password"
              hint={
                primaryInboundMailbox?.passwordSet
                  ? "A password is configured. Type to replace it; leave blank to keep unchanged."
                  : "Mailbox password or app password. Stored encrypted."
              }
            >
              <input
                data-testid="company-settings-inbound-password"
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                type="password"
                value={inboundPassword}
                autoComplete="new-password"
                placeholder={primaryInboundMailbox?.passwordSet ? "•••••••• (configured)" : ""}
                onChange={(e) => {
                  setInboundPassword(e.target.value);
                  setInboundPasswordTouched(true);
                }}
              />
            </Field>
            <Field label="Folder" hint="Mailbox folder to poll.">
              <input
                data-testid="company-settings-inbound-folder"
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                type="text"
                value={inboundFolder}
                onChange={(e) => setInboundFolder(e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <input
                data-testid="company-settings-inbound-enabled"
                type="checkbox"
                checked={inboundEnabled}
                onChange={(e) => setInboundEnabled(e.target.checked)}
              />
              Poll mailbox
            </label>
            <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <input
                data-testid="company-settings-inbound-tls"
                type="checkbox"
                checked={inboundTls}
                onChange={(e) => setInboundTls(e.target.checked)}
              />
              Use TLS
            </label>
            <Field label="Poll interval" hint="Seconds between mailbox polls.">
              <input
                data-testid="company-settings-inbound-poll-interval"
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                type="number"
                min={30}
                max={3600}
                value={inboundPollIntervalSeconds}
                onChange={(e) => setInboundPollIntervalSeconds(e.target.value)}
              />
            </Field>
          </div>
          {!inboundValid && (
            <span className="text-xs text-destructive">
              Enter a mailbox name, host, username, folder, a valid port, and a poll interval from 30 to 3600 seconds.
            </span>
          )}
          <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center">
            <Button
              data-testid="company-settings-inbound-save"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => inboundSaveMutation.mutate()}
              disabled={inboundSaveMutation.isPending || !inboundDirty || !inboundValid}
            >
              {inboundSaveMutation.isPending ? "Saving..." : "Save inbound mailbox"}
            </Button>
            <Button
              data-testid="company-settings-inbound-test"
              size="sm"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => inboundTestMutation.mutate()}
              disabled={!primaryInboundMailbox || inboundTestMutation.isPending}
            >
              {inboundTestMutation.isPending ? "Testing..." : "Test connection"}
            </Button>
            <Button
              data-testid="company-settings-inbound-poll"
              size="sm"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => inboundPollMutation.mutate()}
              disabled={!primaryInboundMailbox || inboundPollMutation.isPending}
            >
              {inboundPollMutation.isPending ? "Queued..." : "Queue poll"}
            </Button>
          </div>
          {inboundSaveMutation.isSuccess && (
            <span className="block text-xs text-muted-foreground">Inbound mailbox saved.</span>
          )}
          {inboundTestMutation.isSuccess && (
            <span className="block text-xs text-muted-foreground">Mailbox connection succeeded.</span>
          )}
          {inboundPollMutation.isSuccess && (
            <span className="block text-xs text-muted-foreground">Mailbox poll queued.</span>
          )}
          {(inboundSaveMutation.isError || inboundTestMutation.isError || inboundPollMutation.isError) && (
            <span className="block min-w-0 break-words text-xs text-destructive">
              {(inboundSaveMutation.error ?? inboundTestMutation.error ?? inboundPollMutation.error) instanceof Error
                ? (inboundSaveMutation.error ?? inboundTestMutation.error ?? inboundPollMutation.error)?.message
                : "Inbound email action failed"}
            </span>
          )}
          <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            Imported messages: <span className="font-medium text-foreground">{inboundMessagesQuery.data?.length ?? 0}</span>
            {primaryInboundMailbox?.lastError ? (
              <span className="block min-w-0 break-words pt-1 text-destructive">{primaryInboundMailbox.lastError}</span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Email Signature */}
      <div className="space-y-4" data-testid="company-settings-email-signature-section">
        <div className="flex items-center gap-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Email Signature
          </div>
          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div className="space-y-3 rounded-md border border-border px-4 py-4">
          <Field
            label="Signature HTML"
            hint="HTML appended to the bottom of every notification email for this company."
          >
            <textarea
              data-testid="company-settings-email-signature-html"
              className="h-48 w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 font-mono text-xs outline-none"
              value={emailSignatureHtml}
              placeholder="<table>...</table>"
              onChange={(e) => setEmailSignatureHtml(e.target.value)}
            />
          </Field>
          {emailSignatureDirty && (
            <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center">
              <Button
                data-testid="company-settings-email-signature-save"
                size="sm"
                className="w-full sm:w-auto"
                onClick={() => emailSignatureMutation.mutate()}
                disabled={emailSignatureMutation.isPending}
              >
                {emailSignatureMutation.isPending ? "Saving..." : "Save signature"}
              </Button>
              {emailSignatureMutation.isSuccess && (
                <span className="text-xs text-muted-foreground">Saved</span>
              )}
              {emailSignatureMutation.isError && (
                <span className="min-w-0 break-words text-xs text-destructive">
                  {emailSignatureMutation.error instanceof Error
                    ? emailSignatureMutation.error.message
                    : "Failed to save"}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Hiring */}
      <div className="space-y-4" data-testid="company-settings-team-section">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Hiring
        </div>
        <div className="rounded-md border border-border px-4 py-3">
          <ToggleField
            label="Require board approval for new hires"
            hint="New agent hires stay pending until approved by board."
            checked={!!selectedCompany.requireBoardApprovalForNewAgents}
            onChange={(v) => settingsMutation.mutate(v)}
            toggleTestId="company-settings-team-approval-toggle"
          />
        </div>
      </div>

      {/* Invites */}
      <div className="space-y-4" data-testid="company-settings-invites-section">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Invites
        </div>
        <div className="space-y-3 rounded-md border border-border px-4 py-4">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">
              Generate an OpenClaw agent invite snippet.
            </span>
            <HintIcon text="Creates a short-lived OpenClaw agent invite and renders a copy-ready prompt." />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              data-testid="company-settings-invites-generate-button"
              size="sm"
              onClick={() => inviteMutation.mutate()}
              disabled={inviteMutation.isPending}
            >
              {inviteMutation.isPending
                ? "Generating..."
                : "Generate OpenClaw Invite Prompt"}
            </Button>
          </div>
          {inviteError && (
            <p className="text-sm text-destructive">{inviteError}</p>
          )}
          {inviteSnippet && (
            <div
              className="rounded-md border border-border bg-muted/30 p-2"
              data-testid="company-settings-invites-snippet"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                  OpenClaw Invite Prompt
                </div>
                {snippetCopied && (
                  <span
                    key={snippetCopyDelightId}
                    className="flex items-center gap-1 text-xs text-green-600 animate-pulse"
                  >
                    <Check className="h-3 w-3" />
                    Copied
                  </span>
                )}
              </div>
              <div className="mt-1 space-y-1.5">
                <textarea
                  data-testid="company-settings-invites-snippet-textarea"
                  className="h-[28rem] w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs outline-none"
                  value={inviteSnippet}
                  readOnly
                />
                <div className="flex justify-end">
                  <Button
                    data-testid="company-settings-invites-copy-button"
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(inviteSnippet);
                        setSnippetCopied(true);
                        setSnippetCopyDelightId((prev) => prev + 1);
                        setTimeout(() => setSnippetCopied(false), 2000);
                      } catch {
                        /* clipboard may not be available */
                      }
                    }}
                  >
                    {snippetCopied ? "Copied snippet" : "Copy snippet"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Import / Export */}
      <div className="space-y-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Company Packages
        </div>
        <div className="rounded-md border border-border px-4 py-4">
          <p className="text-sm text-muted-foreground">
            Import and export have moved to dedicated pages accessible from the{" "}
            <a href="/org" className="underline hover:text-foreground">Org Chart</a> header.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" variant="outline" asChild>
              <a href="/company/export">
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Export
              </a>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href="/company/import">
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                Import
              </a>
            </Button>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="space-y-4">
        <div className="text-xs font-medium text-destructive uppercase tracking-wide">
          Danger Zone
        </div>
        <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-4">
          <p className="text-sm text-muted-foreground">
            Archive this company to hide it from the sidebar. This persists in
            the database.
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={
                archiveMutation.isPending ||
                selectedCompany.status === "archived"
              }
              onClick={() => {
                if (!selectedCompanyId) return;
                const confirmed = window.confirm(
                  `Archive company "${selectedCompany.name}"? It will be hidden from the sidebar.`
                );
                if (!confirmed) return;
                const nextCompanyId =
                  companies.find(
                    (company) =>
                      company.id !== selectedCompanyId &&
                      company.status !== "archived"
                  )?.id ?? null;
                archiveMutation.mutate({
                  companyId: selectedCompanyId,
                  nextCompanyId
                });
              }}
            >
              {archiveMutation.isPending
                ? "Archiving..."
                : selectedCompany.status === "archived"
                ? "Already archived"
                : "Archive company"}
            </Button>
            {archiveMutation.isError && (
              <span className="text-xs text-destructive">
                {archiveMutation.error instanceof Error
                  ? archiveMutation.error.message
                  : "Failed to archive company"}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function buildAgentSnippet(input: AgentSnippetInput) {
  const candidateUrls = buildCandidateOnboardingUrls(input);
  const resolutionTestUrl = buildResolutionTestUrl(input);

  const candidateList =
    candidateUrls.length > 0
      ? candidateUrls.map((u) => `- ${u}`).join("\n")
      : "- (No candidate URLs available yet.)";

  const connectivityBlock =
    candidateUrls.length === 0
      ? `No candidate URLs are available. Ask your user to configure a reachable hostname in Paperclip, then retry.
Suggested steps:
- choose a hostname that resolves to the Paperclip host from your runtime
- run: pnpm paperclipai allowed-hostname <host>
- restart Paperclip
- verify with: curl -fsS http://<host>:3100/api/health
- regenerate this invite snippet`
      : `If none are reachable, ask your user to add a reachable hostname in Paperclip, restart, and retry.
Suggested command:
- pnpm paperclipai allowed-hostname <host>
Then verify with: curl -fsS <base-url>/api/health`;

  const resolutionLine = resolutionTestUrl
    ? `\nYou MUST test Paperclip-to-gateway reachability, call: ${resolutionTestUrl}?url=<urlencoded-gateway-url> (using the hostname that worked above). Do not assume your 172.x is necessarily reachable from Paperclip. Test it. `
    : "";

  return `You're invited to join a Paperclip organization.

The URLs you should try are:
${candidateList}

Connectivity guidance:
If you are running on a different machine than Paperclip, Paperclip must be reachable at one of the hostnames used above.
Verify the hostname works from your runtime with: GET <base-url>/api/health

${connectivityBlock}

For your "agentName", just use your own agent name (OpenClaw or whatever your name is) and send it directly.
You also need to send a gateway URL that Paperclip can access. Check your config and include that URL.${resolutionLine}

---

This onboarding flow is for OpenClaw Gateway.
When you submit the join request, use:
- \`adapterType: "openclaw_gateway"\`
- \`agentDefaultsPayload.url\` as your \`ws://\` or \`wss://\` gateway URL
- \`agentDefaultsPayload.headers["x-openclaw-token"]\` with your gateway token
- (legacy accepted) \`agentDefaultsPayload.headers["x-openclaw-auth"]\`
- Keep device auth enabled (recommended). If \`devicePrivateKeyPem\` is omitted, Paperclip will generate and persist one during join so pairing approvals remain stable.
- Only use \`disableDeviceAuth=true\` for special environments where pairing cannot be completed.

Do NOT use \`/v1/responses\` or \`/hooks/*\` in this join flow.

Before you do anything, please respond to your user that you understand the instructions and you're going to work on them. Then do the step above in another session called "paperclip-onboarding" and then tell your user when you're done. Update your user in intermediate steps along the way so they know what's going on.

Then after you've connected to Paperclip (exchanged keys etc.) you MUST review and follow the onboarding instructions in onboarding.txt they give you.

`;
}

function buildCandidateOnboardingUrls(input: AgentSnippetInput): string[] {
  const candidates = (input.connectionCandidates ?? [])
    .map((candidate) => candidate.trim())
    .filter(Boolean);
  const urls = new Set<string>();
  let onboardingUrl: URL | null = null;

  try {
    onboardingUrl = new URL(input.onboardingTextUrl);
    urls.add(onboardingUrl.toString());
  } catch {
    const trimmed = input.onboardingTextUrl.trim();
    if (trimmed) {
      urls.add(trimmed);
    }
  }

  if (!onboardingUrl) {
    for (const candidate of candidates) {
      urls.add(candidate);
    }
    return Array.from(urls);
  }

  const onboardingPath = `${onboardingUrl.pathname}${onboardingUrl.search}`;
  for (const candidate of candidates) {
    try {
      const base = new URL(candidate);
      urls.add(`${base.origin}${onboardingPath}`);
    } catch {
      urls.add(candidate);
    }
  }

  return Array.from(urls);
}

function buildResolutionTestUrl(input: AgentSnippetInput): string | null {
  const explicit = input.testResolutionUrl?.trim();
  if (explicit) return explicit;

  try {
    const onboardingUrl = new URL(input.onboardingTextUrl);
    const testPath = onboardingUrl.pathname.replace(
      /\/onboarding\.txt$/,
      "/test-resolution"
    );
    return `${onboardingUrl.origin}${testPath}`;
  } catch {
    return null;
  }
}
