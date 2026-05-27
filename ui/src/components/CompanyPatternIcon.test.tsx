// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompanyPatternIcon } from "./CompanyPatternIcon";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("CompanyPatternIcon", () => {
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
    vi.restoreAllMocks();
  });

  it("does not generate a canvas pattern while a logo URL is available", () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext");

    act(() => {
      root.render(
        <CompanyPatternIcon
          companyName="Acme Labs"
          logoUrl="https://example.test/logo.png"
          brandColor="#3366ff"
        />,
      );
    });

    const image = container.querySelector("img");
    expect(image?.getAttribute("src")).toBe("https://example.test/logo.png");
    expect(getContext).not.toHaveBeenCalled();
  });
});
