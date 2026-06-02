// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Tooltip, TooltipProvider } from "./tooltip";

describe("Tooltip", () => {
  it("does not shadow caller TooltipProvider configuration with a nested provider", () => {
    const html = renderToStaticMarkup(
      <TooltipProvider delayDuration={750}>
        <Tooltip>
          <span>content</span>
        </Tooltip>
      </TooltipProvider>,
    );

    expect(html.match(/data-slot="tooltip-provider"/g)).toHaveLength(1);
    expect(html).toContain('data-slot="tooltip"');
  });
});
