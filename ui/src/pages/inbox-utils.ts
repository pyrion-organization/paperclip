import type { JoinRequest } from "@paperclipai/shared";

function nonEmptyLabel(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function formatJoinRequestInboxLabel(
  joinRequest: Pick<
    JoinRequest,
    "requestType" | "agentName" | "requestEmailSnapshot" | "requestingUserId"
  > & {
    requesterUser?: {
      name: string | null;
      email: string | null;
    } | null;
  },
) {
  if (joinRequest.requestType !== "human") {
    return `Agent join request${joinRequest.agentName ? `: ${joinRequest.agentName}` : ""}`;
  }

  const requesterName = nonEmptyLabel(joinRequest.requesterUser?.name);
  const requesterEmail =
    nonEmptyLabel(joinRequest.requesterUser?.email) ??
    nonEmptyLabel(joinRequest.requestEmailSnapshot);
  const requesterId = nonEmptyLabel(joinRequest.requestingUserId);

  if (requesterName && requesterEmail) return `${requesterName} (${requesterEmail})`;
  if (requesterEmail) return requesterEmail;
  if (requesterName) return requesterName;
  if (requesterId) return requesterId;
  return "Human join request";
}
