// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

async function flushReact() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

describe("BoardRoutes", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("renders prefixed board routes as a lazy descendant route tree", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/PER/dashboard"]}>
          <Routes>
            <Route path=":companyPrefix/*" element={<BoardRoutes />} />
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
});
