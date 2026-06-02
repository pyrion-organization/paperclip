// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
});
