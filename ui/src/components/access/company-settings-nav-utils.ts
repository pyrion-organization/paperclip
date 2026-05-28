const COMPANY_SETTINGS_TABS = [
  "general",
  "email",
  "environments",
  "cloud-upstream",
  "members",
  "invites",
  "secrets",
] as const;

export type CompanySettingsTab = (typeof COMPANY_SETTINGS_TABS)[number];

export function getCompanySettingsTab(pathname: string): CompanySettingsTab {
  if (pathname.includes("/company/settings/email")) {
    return "email";
  }

  if (pathname.includes("/company/settings/environments")) {
    return "environments";
  }

  if (pathname.includes("/company/settings/cloud-upstream")) {
    return "cloud-upstream";
  }

  if (pathname.includes("/company/settings/members") || pathname.includes("/company/settings/access")) {
    return "members";
  }

  if (pathname.includes("/company/settings/invites")) {
    return "invites";
  }

  if (pathname.includes("/company/settings/secrets")) {
    return "secrets";
  }

  return "general";
}
