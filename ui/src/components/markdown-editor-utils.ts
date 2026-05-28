import {
  buildAgentMentionHref,
  buildProjectMentionHref,
  buildRoutineMentionHref,
  buildUserMentionHref,
} from "@paperclipai/shared/project-mentions";
import type { SlashCommandOption } from "../context/EditorAutocompleteContext";
import { parseMentionChipHref } from "../lib/mention-chips";

export interface MentionOption {
  id: string;
  name: string;
  kind?: "agent" | "project" | "user";
  agentId?: string;
  agentIcon?: string | null;
  projectId?: string;
  projectColor?: string | null;
  userId?: string;
}

export interface MentionState {
  trigger: "mention" | "skill";
  marker: "@" | "/";
  query: string;
  top: number;
  left: number;
  /**
   * Caret-aligned viewport coords for portal positioning. `viewportTop` /
   * `viewportBottom` describe the active text line, and `viewportLeft` is the
   * caret X (right edge of the last typed character) so the menu can sit on
   * the same line, just to the right of the cursor.
   */
  viewportTop: number;
  viewportBottom: number;
  viewportLeft: number;
  textNode: Text;
  atPos: number;
  endPos: number;
}

export type AutocompleteOption = MentionOption | SlashCommandOption;

export interface MentionMenuViewport {
  offsetLeft: number;
  offsetTop: number;
  width: number;
  height: number;
}

export interface MentionMenuSize {
  width: number;
  height: number;
}

export const MENTION_MENU_WIDTH = 188;
export const MENTION_MENU_HEIGHT = 208;
const MENTION_MENU_PADDING = 8;
export const MENTION_MENU_ROW_HEIGHT = 34;
export const MENTION_MENU_CHROME_HEIGHT = 8;
export const MAX_AUTOCOMPLETE_OPTIONS = 50;
/** Roughly one space-width of breathing room between the caret and the menu. */
const MENTION_MENU_CARET_GAP = 10;

export function findMentionMatch(
  text: string,
  offset: number,
): Pick<MentionState, "trigger" | "marker" | "query" | "atPos" | "endPos"> | null {
  let atPos = -1;
  let trigger: MentionState["trigger"] | null = null;
  let marker: MentionState["marker"] | null = null;
  for (let i = offset - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === "@" || ch === "/") {
      if (i === 0 || /\s/.test(text[i - 1])) {
        atPos = i;
        trigger = ch === "@" ? "mention" : "skill";
        marker = ch;
      }
      break;
    }
    if (ch === "\n" || ch === "\r") break;
  }

  if (atPos === -1) return null;
  const query = text.slice(atPos + 1, offset);
  if (trigger === "skill" && /\s/.test(query) && !query.toLowerCase().startsWith("routine:")) {
    return null;
  }

  return {
    trigger: trigger ?? "mention",
    marker: marker ?? "@",
    query,
    atPos,
    endPos: offset,
  };
}

export function computeMentionMenuPosition(
  anchor: Pick<MentionState, "viewportTop" | "viewportBottom" | "viewportLeft">,
  viewport: MentionMenuViewport,
  menuSize: MentionMenuSize = { width: MENTION_MENU_WIDTH, height: MENTION_MENU_HEIGHT },
) {
  const minLeft = viewport.offsetLeft + MENTION_MENU_PADDING;
  const maxLeft = viewport.offsetLeft + viewport.width - menuSize.width;
  const minTop = viewport.offsetTop + MENTION_MENU_PADDING;
  const maxTop = viewport.offsetTop + viewport.height - menuSize.height;

  const desiredTop = viewport.offsetTop + anchor.viewportTop;
  let top: number;
  if (desiredTop > maxTop) {
    const flipped = viewport.offsetTop + anchor.viewportBottom - menuSize.height;
    top = Math.max(minTop, Math.min(flipped, maxTop));
  } else {
    top = Math.max(minTop, desiredTop);
  }

  const desiredLeft = viewport.offsetLeft + anchor.viewportLeft + MENTION_MENU_CARET_GAP;
  const left = Math.max(minLeft, Math.min(desiredLeft, maxLeft));

  return { top, left };
}

export function shouldAcceptAutocompleteKey(
  key: string,
  trigger: MentionState["trigger"] | null,
  skillEnterArmed = false,
): boolean {
  if (key === "Tab") return true;
  if (key !== "Enter") return false;
  return trigger === "mention" || (trigger === "skill" && skillEnterArmed);
}

export function isSameAutocompleteSession(
  left: Pick<MentionState, "trigger" | "marker" | "query" | "textNode" | "atPos" | "endPos"> | null,
  right: Pick<MentionState, "trigger" | "marker" | "query" | "textNode" | "atPos" | "endPos"> | null,
): boolean {
  if (!left || !right) return false;
  return left.trigger === right.trigger
    && left.marker === right.marker
    && left.query === right.query
    && left.textNode === right.textNode
    && left.atPos === right.atPos
    && left.endPos === right.endPos;
}

function mentionMarkdown(option: MentionOption): string {
  if (option.kind === "project" && option.projectId) {
    return `[@${option.name}](${buildProjectMentionHref(option.projectId, option.projectColor ?? null)}) `;
  }
  if (option.kind === "user" && option.userId) {
    return `[@${option.name}](${buildUserMentionHref(option.userId)}) `;
  }
  const agentId = option.agentId ?? option.id.replace(/^agent:/, "");
  return `[@${option.name}](${buildAgentMentionHref(agentId, option.agentIcon ?? null)}) `;
}

export function slashCommandLabel(option: SlashCommandOption): string {
  return option.kind === "routine" ? `/routine:${option.name}` : `/${option.slug}`;
}

function slashCommandMarkdown(option: SlashCommandOption): string {
  if (option.kind === "routine") {
    return `[${slashCommandLabel(option)}](${buildRoutineMentionHref(option.routineId)}) `;
  }
  return `[/${option.slug}](${option.href}) `;
}

export function autocompleteMarkdown(option: AutocompleteOption): string {
  return option.kind === "skill" || option.kind === "routine"
    ? slashCommandMarkdown(option)
    : mentionMarkdown(option);
}

function autocompleteOptionMatchesLink(option: AutocompleteOption, href: string): boolean {
  const parsed = parseMentionChipHref(href);
  if (!parsed) return false;

  if (option.kind === "skill") {
    return parsed.kind === "skill" && parsed.skillId === option.skillId;
  }
  if (option.kind === "routine") {
    return parsed.kind === "routine" && parsed.routineId === option.routineId;
  }

  if (option.kind === "project" && option.projectId) {
    return parsed.kind === "project" && parsed.projectId === option.projectId;
  }
  if (option.kind === "user" && option.userId) {
    return parsed.kind === "user" && parsed.userId === option.userId;
  }

  const agentId = option.agentId ?? option.id.replace(/^agent:/, "");
  return parsed.kind === "agent" && parsed.agentId === agentId;
}

export function findClosestAutocompleteAnchor(
  editable: HTMLElement,
  option: AutocompleteOption,
  origin?: Pick<MentionState, "left" | "top"> | null,
): HTMLAnchorElement | null {
  const matchingMentions = Array.from(editable.querySelectorAll("a")).flatMap((node) =>
    node instanceof HTMLAnchorElement
      && autocompleteOptionMatchesLink(option, node.getAttribute("href") ?? "")
      ? [node]
      : [],
  );

  if (matchingMentions.length === 0) return null;
  if (!origin) return matchingMentions[0] ?? null;

  const containerRect = editable.getBoundingClientRect();
  let closest: HTMLAnchorElement | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const link of matchingMentions) {
    const rect = link.getBoundingClientRect();
    const left = rect.left - containerRect.left;
    const top = rect.top - containerRect.top;
    const distance = Math.hypot(left - origin.left, top - origin.top);
    if (distance < closestDistance) {
      closest = link;
      closestDistance = distance;
    }
  }
  return closest;
}

export function placeCaretAfterMentionAnchor(target: HTMLAnchorElement): boolean {
  const selection = window.getSelection();
  if (!selection) return false;

  const range = document.createRange();
  const nextSibling = target.nextSibling;
  if (nextSibling?.nodeType === Node.TEXT_NODE) {
    const text = nextSibling.textContent ?? "";
    if (text.startsWith(" ")) {
      range.setStart(nextSibling, 1);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    }
    if (text.length > 0) {
      range.setStart(nextSibling, 0);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    }
  }

  range.setStartAfter(target);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}
