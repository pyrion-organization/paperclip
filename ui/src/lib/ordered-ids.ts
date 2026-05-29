import { useCallback, useState } from "react";

/** Shallow positional equality for ordered id lists. */
export function orderedIdsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Reconcile a desired ordering against the ids that currently exist: drop ids
 * that no longer exist, then append any existing ids missing from the desired
 * order (in canonical order). `canonicalIds` defines both membership and the
 * append order for the leftovers.
 */
export function reconcileOrderedIds(desiredIds: string[], canonicalIds: string[]): string[] {
  const known = new Set(canonicalIds);
  const filtered = desiredIds.filter((id) => known.has(id));
  const seen = new Set(filtered);
  for (const id of canonicalIds) {
    if (seen.has(id)) continue;
    filtered.push(id);
    seen.add(id);
  }
  return filtered;
}

/**
 * Local override state for an ordered id list, keyed by `source` so the override
 * is automatically discarded when the underlying data (and thus the source key)
 * changes. Returns the effective ids and a stable setter that no-ops when the
 * value is unchanged for the current source.
 */
export function useOrderedIdsOverride(source: string, persistedOrderedIds: string[]) {
  const [override, setOverride] = useState<{ source: string; value: string[] } | null>(null);
  const orderedIds = override?.source === source ? override.value : persistedOrderedIds;
  const applyOverride = useCallback(
    (value: string[]) => {
      setOverride((current) =>
        current?.source === source && orderedIdsEqual(current.value, value)
          ? current
          : { source, value },
      );
    },
    [source],
  );
  return { orderedIds, applyOverride };
}
