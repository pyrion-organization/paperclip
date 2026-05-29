// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { orderedIdsEqual, reconcileOrderedIds, useOrderedIdsOverride } from "./ordered-ids";

describe("orderedIdsEqual", () => {
  it("treats same-order, same-length lists as equal", () => {
    expect(orderedIdsEqual(["a", "b", "c"], ["a", "b", "c"])).toBe(true);
    expect(orderedIdsEqual([], [])).toBe(true);
  });

  it("treats different length, order, or contents as not equal", () => {
    expect(orderedIdsEqual(["a", "b"], ["a", "b", "c"])).toBe(false);
    expect(orderedIdsEqual(["a", "b"], ["b", "a"])).toBe(false);
    expect(orderedIdsEqual(["a"], ["b"])).toBe(false);
  });
});

describe("reconcileOrderedIds", () => {
  it("keeps the desired order for ids that still exist", () => {
    expect(reconcileOrderedIds(["c", "a", "b"], ["a", "b", "c"])).toEqual(["c", "a", "b"]);
  });

  it("drops ids that no longer exist", () => {
    expect(reconcileOrderedIds(["a", "gone", "b"], ["a", "b"])).toEqual(["a", "b"]);
  });

  it("appends missing ids in canonical order after the desired ones", () => {
    expect(reconcileOrderedIds(["c"], ["a", "b", "c"])).toEqual(["c", "a", "b"]);
  });

  it("does not append a canonical id twice when it is already present", () => {
    // Canonical ids already in the desired order are not re-appended.
    expect(reconcileOrderedIds(["a", "b"], ["a", "b"])).toEqual(["a", "b"]);
  });

  it("returns canonical order when there is no desired order", () => {
    expect(reconcileOrderedIds([], ["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });
});

describe("useOrderedIdsOverride", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let latest: ReturnType<typeof useOrderedIdsOverride>;

  function Harness({ source, persisted }: { source: string; persisted: string[] }) {
    latest = useOrderedIdsOverride(source, persisted);
    return null;
  }

  const render = (source: string, persisted: string[]) => {
    act(() => {
      root.render(<Harness source={source} persisted={persisted} />);
    });
  };

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("returns the persisted ids when no override is set", () => {
    render("src-1", ["a", "b"]);
    expect(latest.orderedIds).toEqual(["a", "b"]);
  });

  it("returns the override value once applied for the current source", () => {
    render("src-1", ["a", "b"]);
    act(() => latest.applyOverride(["b", "a"]));
    expect(latest.orderedIds).toEqual(["b", "a"]);
  });

  it("discards the override when the source changes (underlying data changed)", () => {
    render("src-1", ["a", "b"]);
    act(() => latest.applyOverride(["b", "a"]));
    expect(latest.orderedIds).toEqual(["b", "a"]);

    // New source key => stale override is ignored, persisted wins.
    render("src-2", ["a", "b", "c"]);
    expect(latest.orderedIds).toEqual(["a", "b", "c"]);
  });

  it("keeps a stable applyOverride identity across rerenders with the same source", () => {
    render("src-1", ["a", "b"]);
    const first = latest.applyOverride;
    render("src-1", ["a", "b", "c"]);
    expect(latest.applyOverride).toBe(first);
  });
});
