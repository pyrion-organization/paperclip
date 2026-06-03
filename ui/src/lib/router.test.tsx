// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Issue } from "@paperclipai/shared";
import { Link } from "./router";

vi.mock("@/context/CompanyContext", () => ({
  useCompany: () => ({
    selectedCompany: null,
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("Link", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders disabled issue quicklook links without a query client provider", () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <Link disableIssueQuicklook to="/issues/PAP-1">
            PAP-1
          </Link>
        </MemoryRouter>,
      );
    });

    const link = container.querySelector("a");
    expect(link?.textContent).toBe("PAP-1");
    expect(link?.getAttribute("href")).toBe("/issues/PAP-1");
  });

  it("preserves issue prefetch state for disabled issue quicklook links", () => {
    const issue = {
      id: "11111111-1111-4111-8111-111111111111",
      identifier: "PAP-1",
      title: "Prefetched issue",
      status: "todo",
      priority: "medium",
      projectId: null,
      project: null,
      blockerAttention: null,
      originKind: "manual",
      originId: null,
    } as unknown as Issue;

    function IssueDetailState() {
      const location = useLocation();
      const state = location.state as { issueDetailHeaderSeed?: { id?: string; title?: string } } | null;
      return (
        <div>
          {state?.issueDetailHeaderSeed?.id}:{state?.issueDetailHeaderSeed?.title}
        </div>
      );
    }

    act(() => {
      root.render(
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route
              path="/"
              element={(
                <Link disableIssueQuicklook issuePrefetch={issue} to="/issues/PAP-1">
                  PAP-1
                </Link>
              )}
            />
            <Route path="/issues/:issueId" element={<IssueDetailState />} />
          </Routes>
        </MemoryRouter>,
      );
    });

    const link = container.querySelector("a");
    expect(link).not.toBeNull();

    act(() => {
      link?.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        button: 0,
      }));
    });

    expect(container.textContent).toContain("11111111-1111-4111-8111-111111111111:Prefetched issue");
  });

  it("keeps enabled issue quicklook links lazy until interaction", () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <Link to="/issues/PAP-1">PAP-1</Link>
        </MemoryRouter>,
      );
    });

    const link = container.querySelector("a");
    expect(link?.textContent).toBe("PAP-1");
    expect(link?.getAttribute("href")).toBe("/issues/PAP-1");
  });

  it("navigates enabled lazy issue quicklook links on click", () => {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route path="/" element={<Link to="/issues/PAP-1">PAP-1</Link>} />
            <Route path="/issues/:issueId" element={<div>Issue detail loaded</div>} />
          </Routes>
        </MemoryRouter>,
      );
    });

    const link = container.querySelector("a");
    expect(link).not.toBeNull();

    act(() => {
      link?.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        button: 0,
      }));
    });

    expect(container.textContent).toContain("Issue detail loaded");
  });
});
