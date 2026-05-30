// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardRoutes } from "./BoardRoutes";

vi.mock("./components/Layout", () => ({
  Layout: () => (
    <div>
      <span>Layout shell</span>
      <Outlet />
    </div>
  ),
}));

vi.mock("./pages/Dashboard", () => ({
  Dashboard: () => <div>Dashboard page</div>,
}));

vi.mock("./pages/Agents", () => ({
  Agents: () => <div>Agents page</div>,
}));

vi.mock("./pages/Issues", () => ({
  Issues: () => <div>Issues page</div>,
}));

vi.mock("@/context/CompanyContext", () => ({
  useCompany: () => ({
    selectedCompany: { id: "company-1", issuePrefix: "PER" },
    selectedCompanyId: "company-1",
    companies: [{ id: "company-1", issuePrefix: "PER" }],
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

async function flushReact() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

describe("BoardRoutes", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("renders non-dashboard board routes as a lazy descendant route tree", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/PER/agents/all"]}>
          <Routes>
            <Route path=":companyPrefix/*" element={<BoardRoutes />} />
          </Routes>
        </MemoryRouter>,
      );
    });
    await flushReact();

    expect(container.textContent).toContain("Layout shell");
    expect(container.textContent).toContain("Agents page");

    await act(async () => {
      root.unmount();
    });
  });

  it("keeps company-prefixed redirects on the URL company", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/PER/issues/all"]}>
          <LocationProbe />
          <Routes>
            <Route path=":companyPrefix/*" element={<BoardRoutes />} />
          </Routes>
        </MemoryRouter>,
      );
    });
    await flushReact();

    expect(container.textContent).toContain("Issues page");
    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe("/PER/issues");

    await act(async () => {
      root.unmount();
    });
  });
});
