import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/context/CompanyContext";
import { cn } from "@/lib/classnames";

const SidebarCompanyMenu = lazy(() =>
  import("./SidebarCompanyMenu").then((module) => ({ default: module.SidebarCompanyMenu })),
);

function WorkspaceIconFallback({
  brandColor,
  companyName,
  logoUrl,
}: {
  brandColor?: string | null;
  companyName: string;
  logoUrl?: string | null;
}) {
  const initial = companyName.trim().charAt(0).toUpperCase() || "?";
  const [logoFailed, setLogoFailed] = useState(false);
  const logo = !logoFailed && typeof logoUrl === "string" && logoUrl.trim().length > 0 ? logoUrl : null;

  useEffect(() => {
    setLogoFailed(false);
  }, [logoUrl]);

  if (logo) {
    return (
      <span
        aria-hidden="true"
        className="relative flex size-5 shrink-0 overflow-hidden rounded-md bg-muted"
      >
        <img
          src={logo}
          alt=""
          className="absolute inset-0 size-full object-cover"
          onError={() => setLogoFailed(true)}
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex size-5 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold text-white"
      style={{ backgroundColor: brandColor?.trim() || "#64748b" }}
    >
      {initial}
    </span>
  );
}

export function DeferredSidebarCompanyMenu() {
  const [open, setOpen] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(false);
  const { selectedCompany } = useCompany();

  const loadMenu = useCallback(() => {
    setShouldLoad(true);
  }, []);

  const openMenu = useCallback(() => {
    setShouldLoad(true);
    setOpen(true);
  }, []);

  if (shouldLoad) {
    return (
      <Suspense
        fallback={(
          <CompanyMenuFallbackButton
            loading
            onLoadIntent={loadMenu}
            onOpenIntent={openMenu}
            selectedCompany={selectedCompany}
          />
        )}
      >
        <SidebarCompanyMenu open={open} onOpenChange={setOpen} />
      </Suspense>
    );
  }

  return (
    <CompanyMenuFallbackButton
      onLoadIntent={loadMenu}
      onOpenIntent={openMenu}
      selectedCompany={selectedCompany}
    />
  );
}

function CompanyMenuFallbackButton({
  loading = false,
  onLoadIntent,
  onOpenIntent,
  selectedCompany,
}: {
  loading?: boolean;
  onLoadIntent: () => void;
  onOpenIntent: () => void;
  selectedCompany: ReturnType<typeof useCompany>["selectedCompany"];
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className={cn("h-9 flex-1 justify-start gap-2 px-2 text-left", loading && "text-muted-foreground")}
      aria-busy={loading || undefined}
      aria-label={selectedCompany ? `Open ${selectedCompany.name} workspace switcher` : "Open workspace switcher"}
      onClick={onOpenIntent}
      onFocus={onLoadIntent}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">
        {selectedCompany ? (
          <WorkspaceIconFallback
            companyName={selectedCompany.name}
            brandColor={selectedCompany.brandColor}
            logoUrl={selectedCompany.logoUrl}
          />
        ) : null}
        <span className="truncate text-sm font-bold text-foreground">
          {selectedCompany?.name ?? "Select workspace"}
        </span>
      </span>
      <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
    </Button>
  );
}
