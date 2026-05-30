// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CompanyInstructions } from "./CompanyInstructions";

vi.mock("../context/CompanyContext", () => ({
  useCompany: () => ({ selectedCompanyId: null }),
}));

vi.mock("../context/BreadcrumbContext", () => ({
  useBreadcrumbs: () => ({ setBreadcrumbs: vi.fn() }),
}));

vi.mock("../context/SidebarContext", () => ({
  useSidebar: () => ({ isMobile: false }),
}));

vi.mock("../components/MarkdownEditor", () => ({
  MarkdownEditor: () => <textarea aria-label="Instructions editor" />,
}));

vi.mock("../components/PackageFileTree", () => ({
  PackageFileTree: () => <div>File tree</div>,
}));

describe("CompanyInstructions", () => {
  it("does not render instruction actions without a selected company", () => {
    const queryClient = new QueryClient();
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <CompanyInstructions />
      </QueryClientProvider>,
    );

    expect(html).toContain("Select a company to manage instructions.");
    expect(html).not.toContain("Company Instructions");
  });
});
