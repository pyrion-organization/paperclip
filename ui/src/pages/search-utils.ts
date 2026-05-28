import type { CompanySearchScope } from "@paperclipai/shared";

export function buildSearchUrl(href: string, query: string, scope: CompanySearchScope): string {
  const url = new URL(href);
  if (query.length === 0) {
    url.searchParams.delete("q");
  } else {
    url.searchParams.set("q", query);
  }
  if (scope === "all") {
    url.searchParams.delete("scope");
  } else {
    url.searchParams.set("scope", scope);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
