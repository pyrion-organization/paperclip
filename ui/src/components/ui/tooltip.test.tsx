// @vitest-environment jsdom

import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Tooltip, TooltipProvider } from "./tooltip";

vi.mock("radix-ui", () => ({
  Tooltip: {
    Provider: ({ children, delayDuration: _delayDuration, ...props }: React.ComponentProps<"div"> & { delayDuration?: number }) => (
      <div data-radix-provider="true" {...props}>{children}</div>
    ),
    Root: ({ children, ...props }: React.ComponentProps<"div">) => (
      <div data-radix-root="true" {...props}>{children}</div>
    ),
    Trigger: ({ children, ...props }: React.ComponentProps<"button">) => (
      <button {...props}>{children}</button>
    ),
    Portal: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    Content: ({ children, ...props }: React.ComponentProps<"div">) => (
      <div {...props}>{children}</div>
    ),
    Arrow: (props: React.ComponentProps<"div">) => <div {...props} />,
  },
}));

describe("Tooltip", () => {
  it("does not shadow caller TooltipProvider configuration with a nested provider", () => {
    const html = renderToStaticMarkup(
      <TooltipProvider delayDuration={750}>
        <Tooltip>
          <span>content</span>
        </Tooltip>
      </TooltipProvider>,
    );

    expect(html.match(/data-radix-provider="true"/g)).toHaveLength(1);
    expect(html).toContain('data-slot="tooltip"');
  });
});
