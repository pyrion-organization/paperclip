import { useRef, type MutableRefObject } from "react";

/**
 * Like `useRef`, but the initial value is produced lazily on the first render
 * only — avoids re-allocating the value (e.g. `new Map()`/`new Set()`) on every
 * render the way `useRef(new Map())` would.
 */
export function useLazyRef<T>(init: () => T): MutableRefObject<T> {
  const ref = useRef<T | null>(null);
  if (ref.current === null) {
    ref.current = init();
  }
  return ref as MutableRefObject<T>;
}
