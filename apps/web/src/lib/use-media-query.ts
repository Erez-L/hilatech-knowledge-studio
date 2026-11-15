"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Returns false on the server and during hydration, then tracks the query. */
export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (notify: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}
