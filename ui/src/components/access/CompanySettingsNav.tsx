import { PageTabBar } from "@/components/PageTabBar";
import { Tabs } from "@/components/ui/tabs";
import { useLocation, useNavigate } from "@/lib/router";
import { getCompanySettingsTab } from "./company-settings-nav-utils";

const items = [
  { value: "general", label: "General", href: "/company/settings" },
  { value: "email", label: "Email", href: "/company/settings/email" },
  { value: "environments", label: "Environments", href: "/company/settings/environments" },
  { value: "cloud-upstream", label: "Cloud upstream", href: "/company/settings/cloud-upstream" },
  { value: "members", label: "Members", href: "/company/settings/members" },
  { value: "invites", label: "Invites", href: "/company/settings/invites" },
  { value: "secrets", label: "Secrets", href: "/company/settings/secrets" },
] as const;

export function CompanySettingsNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = getCompanySettingsTab(location.pathname);

  function handleTabChange(value: string) {
    const nextTab = items.find((item) => item.value === value);
    if (!nextTab || nextTab.value === activeTab) return;
    navigate(nextTab.href);
  }

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      <PageTabBar
        items={items.map(({ value, label }) => ({ value, label }))}
        value={activeTab}
        onValueChange={handleTabChange}
        align="start"
      />
    </Tabs>
  );
}
