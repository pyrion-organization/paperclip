// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { SearchResultRow } from "./SearchResultRow";

vi.mock("@/context/CompanyContext", () => ({
  useCompany: () => ({
    selectedCompany: { id: "company-1", issuePrefix: "PAP" },
    selectedCompanyId: "company-1",
    companies: [{ id: "company-1", issuePrefix: "PAP" }],
  }),
}));

describe("SearchResultRow", () => {
  it("renders title highlights against the title snippet text", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <SearchResultRow
          result={{
            type: "issue",
            id: "issue-1",
            title: "Canonical issue title",
            href: "/PAP/issues/issue-1",
            sourceLabel: "Issue",
            snippet: "Snippet title with match",
            snippets: [
              {
                field: "title",
                label: "Title",
                text: "Snippet title with match",
                highlights: [{ start: 19, end: 24 }],
              },
            ],
            issue: {
              id: "issue-1",
              identifier: "PAP-1",
              title: "Canonical issue title",
              status: "todo",
              assigneeAgentId: null,
              updatedAt: "2026-05-30T00:00:00.000Z",
            },
            updatedAt: "2026-05-30T00:00:00.000Z",
          } as never}
        />
      </MemoryRouter>,
    );

    expect(html).toContain("Snippet title with");
    expect(html).toContain("<mark");
    expect(html).not.toContain("Canonical issue title");
  });
});
