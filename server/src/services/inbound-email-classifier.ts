import type {
  InboundEmailClassificationCategory,
  InboundEmailClassificationSeverity,
  InboundEmailRecommendedAction,
} from "@paperclipai/shared";

export const INBOUND_EMAIL_CLASSIFICATION_RULE_VERSION = "deterministic-v1";

export interface InboundEmailClassification {
  category: InboundEmailClassificationCategory;
  confidence: number;
  severity: InboundEmailClassificationSeverity;
  recommendedAction: InboundEmailRecommendedAction;
  finalAction: InboundEmailRecommendedAction;
  summary: string;
  safetyFlags: string[];
  ruleVersion: string;
}

export interface InboundEmailClassificationInput {
  subject: string | null;
  bodyText: string | null;
  bodyHtmlText?: string | null;
  senderTrusted: boolean;
  projectResolved: boolean;
}

const PROMPT_INJECTION_PATTERNS: Array<[RegExp, string]> = [
  [/\bignore\s+(all\s+)?previous\s+instructions\b/i, "prompt_injection"],
  [/\bsystem\s+prompt\b/i, "prompt_injection"],
  [/\bdeveloper\s+message\b/i, "prompt_injection"],
  [/\bprint\s+(the\s+)?(secrets?|api\s+keys?|tokens?|passwords?)\b/i, "secret_request"],
  [/\b(api\s+key|token|password|senha)\b/i, "secret_reference"],
  [/\brun\s+this\s+command\b/i, "dangerous_operation"],
  [/\bdelete\s+(the\s+)?database\b/i, "dangerous_operation"],
  [/\bdeploy\s+immediately\b/i, "dangerous_operation"],
];

const CLASSIFICATION_PATTERNS: Array<{
  category: InboundEmailClassificationCategory;
  confidence: number;
  severity: InboundEmailClassificationSeverity;
  recommendedAction: InboundEmailRecommendedAction;
  summary: string;
  pattern: RegExp;
}> = [
  {
    category: "infra_incident",
    confidence: 82,
    severity: "high",
    recommendedAction: "defer_future_infra_agent",
    summary: "Message appears to report infrastructure, hosting, or availability trouble.",
    pattern: /\b(vps|down|server\s+down|fora\s+do\s+ar|dns|ssl|database\s+unreachable|banco\s+de\s+dados|timeout|latency|502|503|504)\b/i,
  },
  {
    category: "code_bug",
    confidence: 82,
    severity: "high",
    recommendedAction: "create_agent_task",
    summary: "Message appears to report a product or code defect.",
    pattern: /\b(bug|erro|error|500|crash|exception|stack\s+trace|quebrou|n[aã]o\s+funciona|failed|failure|regression)\b/i,
  },
  {
    category: "account_access",
    confidence: 78,
    severity: "medium",
    recommendedAction: "create_triage_issue",
    summary: "Message appears to involve account, login, registration, or permission access.",
    pattern: /\b(login|senha|acesso|permiss[aã]o|cadastro|usu[aá]rio|usuario|invite)\b/i,
  },
  {
    category: "feature_request",
    confidence: 76,
    severity: "medium",
    recommendedAction: "create_triage_issue",
    summary: "Message appears to request a product or workflow change.",
    pattern: /\b(gostaria|queria|adicionar|alterar|mudar|melhoria|feature|request)\b/i,
  },
  {
    category: "how_to_question",
    confidence: 74,
    severity: "low",
    recommendedAction: "reply_with_guidance",
    summary: "Message appears to be a user question or support guidance request.",
    pattern: /\b(como\s+fa[cç]o|how\s+do\s+i|d[uú]vida|duvida|question|pergunta)\b/i,
  },
];

function normalizeInputText(input: InboundEmailClassificationInput): string {
  return [
    input.subject ?? "",
    input.bodyText ?? input.bodyHtmlText ?? "",
  ].join("\n").trim();
}

export function detectInboundEmailSafetyFlags(input: InboundEmailClassificationInput): string[] {
  const text = normalizeInputText(input);
  const flags = new Set<string>();
  for (const [pattern, flag] of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(text)) flags.add(flag);
  }
  return [...flags];
}

export function decideInboundEmailFinalAction(input: {
  category: InboundEmailClassificationCategory;
  recommendedAction: InboundEmailRecommendedAction;
  safetyFlags: string[];
  senderTrusted: boolean;
}): InboundEmailRecommendedAction {
  if (input.safetyFlags.length > 0) return "discard_or_quarantine";
  if (!input.senderTrusted) return "reply_request_more_info";
  if (input.category === "spam_or_irrelevant") return "discard_or_quarantine";
  if (input.category === "infra_incident") return "defer_future_infra_agent";
  return "create_triage_issue";
}

export function classifyInboundEmailMessage(input: InboundEmailClassificationInput): InboundEmailClassification {
  const text = normalizeInputText(input);
  const safetyFlags = detectInboundEmailSafetyFlags(input);
  if (safetyFlags.length > 0) {
    const recommendedAction = "discard_or_quarantine";
    return {
      category: "unsafe_or_prompt_injection",
      confidence: 92,
      severity: "high",
      recommendedAction,
      finalAction: decideInboundEmailFinalAction({
        category: "unsafe_or_prompt_injection",
        recommendedAction,
        safetyFlags,
        senderTrusted: input.senderTrusted,
      }),
      summary: "Message contains unsafe agent-control, secret-related, or dangerous operation instructions.",
      safetyFlags,
      ruleVersion: INBOUND_EMAIL_CLASSIFICATION_RULE_VERSION,
    };
  }

  const matched = CLASSIFICATION_PATTERNS.find((candidate) => candidate.pattern.test(text));
  const category = matched?.category ?? "unclear";
  const recommendedAction = matched?.recommendedAction ?? "reply_request_more_info";
  return {
    category,
    confidence: matched?.confidence ?? 50,
    severity: matched?.severity ?? "medium",
    recommendedAction,
    finalAction: decideInboundEmailFinalAction({
      category,
      recommendedAction,
      safetyFlags,
      senderTrusted: input.senderTrusted,
    }),
    summary: matched?.summary ?? "Message could not be classified confidently.",
    safetyFlags,
    ruleVersion: INBOUND_EMAIL_CLASSIFICATION_RULE_VERSION,
  };
}
