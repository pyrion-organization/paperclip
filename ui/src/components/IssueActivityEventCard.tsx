import type { ActivityEvent, Agent } from "@paperclipai/shared";
import { AlertTriangle } from "lucide-react";

import { formatIssueActivityAction } from "@/lib/activity-format";

import type { CompanyUserProfile } from "../lib/company-members";
import {
  SUCCESSFUL_RUN_HANDOFF_ESCALATED_ACTION,
  SUCCESSFUL_RUN_HANDOFF_REQUIRED_ACTION,
  successfulRunHandoffActivityTone,
} from "../lib/successful-run-handoff";
import { cn, relativeTime } from "../lib/utils";
import { Identity } from "./Identity";
import { IssueReferenceActivitySummary } from "./IssueReferenceActivitySummary";

type IssueActivityEventCardProps = {
  event: ActivityEvent;
  agentMap: Map<string, Agent>;
  userProfileMap?: Map<string, CompanyUserProfile>;
  currentUserId: string | null;
};

function ActorIdentity({
  event,
  agentMap,
  userProfileMap,
}: {
  event: ActivityEvent;
  agentMap: Map<string, Agent>;
  userProfileMap?: Map<string, CompanyUserProfile>;
}) {
  const id = event.actorId;
  if (event.actorType === "agent") {
    const agent = agentMap.get(id);
    return <Identity name={agent?.name ?? id.slice(0, 8)} size="sm" />;
  }
  if (event.actorType === "system") return <Identity name="System" size="sm" />;
  if (event.actorType === "user") {
    const profile = userProfileMap?.get(id);
    return <Identity name={profile?.label ?? "Board"} avatarUrl={profile?.image} size="sm" />;
  }
  return <Identity name={id || "Unknown"} size="sm" />;
}

export function IssueActivityEventCard({
  event,
  agentMap,
  userProfileMap,
  currentUserId,
}: IssueActivityEventCardProps) {
  const tone = successfulRunHandoffActivityTone(event.action);
  const isHandoffWarning =
    event.action === SUCCESSFUL_RUN_HANDOFF_REQUIRED_ACTION
    || event.action === SUCCESSFUL_RUN_HANDOFF_ESCALATED_ACTION;

  return (
    <div className={cn("space-y-1.5 rounded-lg border px-3 py-2 text-xs", tone.className)}>
      <div className="flex items-center gap-1.5">
        {isHandoffWarning ? (
          <AlertTriangle className={cn("size-3.5 shrink-0", tone.iconClassName)} />
        ) : null}
        <ActorIdentity event={event} agentMap={agentMap} userProfileMap={userProfileMap} />
        <span>{formatIssueActivityAction(event.action, event.details, { agentMap, userProfileMap, currentUserId })}</span>
        <span className="ml-auto shrink-0">{relativeTime(event.createdAt)}</span>
      </div>
      <IssueReferenceActivitySummary event={event} />
    </div>
  );
}
