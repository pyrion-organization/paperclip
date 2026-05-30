// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Checkbox } from "./checkbox";

describe("Checkbox", () => {
  it("renders a distinct icon for indeterminate state", () => {
    const checked = renderToStaticMarkup(<Checkbox checked />);
    const indeterminate = renderToStaticMarkup(<Checkbox checked="indeterminate" />);

    expect(indeterminate).toContain("data-state=\"indeterminate\"");
    expect(indeterminate).not.toBe(checked);
  });
});
