import { Inbox } from "lucide-react";

import { useSidebarBadges } from "../hooks/useSidebarBadges";
import { SidebarNavItem } from "./SidebarNavItem";

type SidebarInboxNavItemProps = {
  companyId: string | null;
};

export function SidebarInboxNavItem({ companyId }: SidebarInboxNavItemProps) {
  const inboxBadge = useSidebarBadges(companyId);

  return (
    <SidebarNavItem
      to="/inbox"
      label="Inbox"
      icon={Inbox}
      badge={inboxBadge.inbox}
      badgeTone={inboxBadge.failedRuns > 0 ? "danger" : "default"}
      alert={inboxBadge.failedRuns > 0}
    />
  );
}
