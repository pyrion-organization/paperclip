import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SidebarProvider } from "./SidebarContext";

describe("SidebarProvider", () => {
  it("can render without a browser window", () => {
    expect(() => renderToString(<SidebarProvider><div>content</div></SidebarProvider>)).not.toThrow();
  });
});
