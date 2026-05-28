import { Lightbulb, ShieldAlert, ShieldCheck, UserPlus } from "lucide-react";

export const typeLabel: Record<string, string> = {
  hire_agent: "Hire Agent",
  approve_ceo_strategy: "CEO Strategy",
  budget_override_required: "Budget Override",
  request_board_approval: "Board Approval",
};

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

export function approvalSubject(payload?: Record<string, unknown> | null): string | null {
  return firstNonEmptyString(
    payload?.title,
    payload?.name,
    payload?.summary,
    payload?.recommendedAction,
  );
}

export function approvalLabel(type: string, payload?: Record<string, unknown> | null): string {
  const base = typeLabel[type] ?? type;
  const subject = approvalSubject(payload);
  if (subject) {
    return `${base}: ${subject}`;
  }
  return base;
}

export const typeIcon: Record<string, typeof UserPlus> = {
  hire_agent: UserPlus,
  approve_ceo_strategy: Lightbulb,
  budget_override_required: ShieldAlert,
  request_board_approval: ShieldCheck,
};

export const defaultTypeIcon = ShieldCheck;
