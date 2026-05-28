// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, type QueryKey } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInvalidatingMutation } from "./useInvalidatingMutation";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function MutationButton({
  invalidateQueryKeys,
}: {
  invalidateQueryKeys?: QueryKey[];
}) {
  const mutation = useInvalidatingMutation({
    mutationFn: async () => "ok",
    invalidateQueryKeys,
  });

  return (
    <button type="button" onClick={() => mutation.mutate()}>
      mutate
    </button>
  );
}

describe("useInvalidatingMutation", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("does not invalidate every active query when no query keys are provided", async () => {
    const queryClient = new QueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MutationButton />
        </QueryClientProvider>,
      );
    });

    const button = container.querySelector("button");
    expect(button).not.toBeNull();

    await act(async () => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(invalidateQueries).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("invalidates explicit query keys", async () => {
    const queryClient = new QueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MutationButton invalidateQueryKeys={[["issues", "list"]]} />
        </QueryClientProvider>,
      );
    });

    const button = container.querySelector("button");
    expect(button).not.toBeNull();

    await act(async () => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["issues", "list"] });

    await act(async () => {
      root.unmount();
    });
  });
});
