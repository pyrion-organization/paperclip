// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardDashboardRoutes } from "./BoardDashboardRoutes";

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

vi.mock("./pages/DashboardLive", () => ({
  DashboardLive: () => <div>Dashboard live page</div>,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

async function flushReact() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

describe("BoardDashboardRoutes", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("renders the dashboard through the lightweight dashboard route module", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/PER/dashboard"]}>
          <Routes>
            <Route path=":companyPrefix/dashboard/*" element={<BoardDashboardRoutes />} />
          </Routes>
        </MemoryRouter>,
      );
    });
    await flushReact();

    expect(container.textContent).toContain("Layout shell");
    expect(container.textContent).toContain("Dashboard page");

    await act(async () => {
      root.unmount();
    });
  });

  it("renders the live dashboard subroute", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/PER/dashboard/live"]}>
          <Routes>
            <Route path=":companyPrefix/dashboard/*" element={<BoardDashboardRoutes />} />
          </Routes>
        </MemoryRouter>,
      );
    });
    await flushReact();

    expect(container.textContent).toContain("Layout shell");
    expect(container.textContent).toContain("Dashboard live page");

    await act(async () => {
      root.unmount();
    });
  });
});
