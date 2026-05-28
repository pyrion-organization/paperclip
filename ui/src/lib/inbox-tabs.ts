const INBOX_LAST_TAB_KEY = "paperclip:inbox:last-tab";

export type InboxTab = "mine" | "recent" | "unread" | "blocked" | "all";

export function loadLastInboxTab(): InboxTab {
  try {
    const raw = localStorage.getItem(INBOX_LAST_TAB_KEY);
    if (
      raw === "all"
      || raw === "unread"
      || raw === "recent"
      || raw === "mine"
      || raw === "blocked"
    ) return raw;
    if (raw === "new") return "mine";
    return "mine";
  } catch {
    return "mine";
  }
}

export function saveLastInboxTab(tab: InboxTab) {
  try {
    localStorage.setItem(INBOX_LAST_TAB_KEY, tab);
  } catch {
    // Ignore localStorage failures.
  }
}
