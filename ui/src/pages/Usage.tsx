import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Clock, RefreshCw, WifiOff } from "lucide-react";
import { usageApi, type ProviderUsage, type TimeWindow } from "../api/usage";
import { EmptyState } from "../components/EmptyState";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const PROVIDER_LABELS: Record<string, string> = {
  claude: "Claude",
  codex: "Codex",
};

function relativeReset(isoString: string | null): string {
  if (!isoString) return "unknown";
  const diff = new Date(isoString).getTime() - Date.now();
  if (diff <= 0) return "soon";
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs < 24) return rem > 0 ? `in ${hrs}h ${rem}m` : `in ${hrs}h`;
  return `in ${Math.round(hrs / 24)}d`;
}

function absoluteReset(isoString: string | null): string | null {
  if (!isoString) return null;
  const date = new Date(isoString);
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function barColor(pct: number) {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 70) return "bg-yellow-500";
  return "bg-emerald-500";
}

function statusLabel(pct: number) {
  if (pct >= 90) return "Nearly full";
  if (pct >= 70) return "Getting close";
  return "On track";
}

function statusTextColor(pct: number) {
  if (pct >= 90) return "text-red-500";
  if (pct >= 70) return "text-yellow-500";
  return "text-emerald-500";
}

function WindowRow({ w }: { w: TimeWindow }) {
  const pct = Math.min(100, Math.max(0, w.usedPercent));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide shrink-0">
          {w.label}
        </span>
        <span className={cn("text-xs font-medium shrink-0", statusTextColor(pct))}>
          {statusLabel(pct)}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className={cn("text-3xl font-bold font-mono tabular-nums leading-none w-16 shrink-0", statusTextColor(pct))}>
          {pct}<span className="text-lg text-muted-foreground">%</span>
        </span>
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="h-2 w-full overflow-hidden bg-muted">
            <div
              className={cn("h-full transition-all duration-500", barColor(pct))}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1 shrink-0">
              <Clock className="h-3 w-3 shrink-0" />
              <span>Resets {relativeReset(w.resetsAt)}</span>
            </div>
            {absoluteReset(w.resetsAt) && (
              <span className="text-right tabular-nums">{absoluteReset(w.resetsAt)}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProviderCard({ p }: { p: ProviderUsage }) {
  const label = PROVIDER_LABELS[p.provider] ?? p.provider;
  const highestPct = Math.max(...p.windows.map((w) => w.usedPercent));

  return (
    <Card className={cn(highestPct >= 90 && "border-red-500/50")}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base font-semibold">{label}</CardTitle>
          <div className="flex items-center gap-1.5 flex-wrap">
            {p.isMock && (
              <span className="text-[11px] font-medium px-1.5 py-0.5 bg-muted text-muted-foreground border border-border">
                Mock
              </span>
            )}
            <span className="text-[11px] font-medium px-1.5 py-0.5 bg-accent text-foreground border border-border">
              {p.plan}
            </span>
          </div>
        </div>
        {p.error && (
          <div className="flex items-start gap-1.5 mt-1">
            <AlertCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-snug">{p.error}</p>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-5">
          {p.windows.map((w) => (
            <WindowRow key={w.label} w={w} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-12" />
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-2">
            <div className="flex justify-between">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-16 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function Usage() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);

  useEffect(() => {
    setBreadcrumbs([{ label: "Usage" }]);
  }, [setBreadcrumbs]);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: queryKeys.usage,
    queryFn: () => usageApi.getAll(),
    refetchInterval: 5 * 60_000,
  });

  useEffect(() => {
    if (data) setLastUpdated(new Date());
  }, [data]);

  useEffect(() => {
    if (!lastUpdated) return;
    const id = setInterval(() => {
      setSecondsAgo(Math.round((Date.now() - lastUpdated.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [lastUpdated]);

  const hasMock = data?.providers.some((p) => p.isMock);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">Usage</h1>
          <p className="text-sm text-muted-foreground mt-0.5">AI subscription status</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {lastUpdated && !isFetching && (
            <span className="hidden sm:block text-xs text-muted-foreground">
              {secondsAgo}s ago
            </span>
          )}
          {isFetching && (
            <span className="hidden sm:block text-xs text-muted-foreground animate-pulse">
              Refreshing…
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="gap-1.5"
            aria-label="Refresh usage"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            <span className="hidden xs:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      )}

      {/* Error */}
      {isError && !isLoading && (
        <EmptyState
          icon={WifiOff}
          message="Could not load usage data. Check that the server is running."
        />
      )}

      {/* Cards */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {data.providers.map((p) => (
            <ProviderCard key={p.provider} p={p} />
          ))}
        </div>
      )}

      {/* Mock disclaimer */}
      {hasMock && (
        <p className="text-xs text-muted-foreground px-0.5">
          Providers marked "Mock" show placeholder values — CLI credentials were not found on this machine.
        </p>
      )}
    </div>
  );
}
