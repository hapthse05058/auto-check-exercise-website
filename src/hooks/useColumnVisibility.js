import { useCallback, useState } from "react";

import { storageGet, storageSet } from "../auth/storage.js";

/**
 * Which table columns are shown, as a TanStack `columnVisibility` map
 * ({ columnId: boolean }), remembered in localStorage under `storageKey`.
 * Columns missing from both the saved map and `defaults` are shown.
 *
 * Returns [visibility, setVisibility, reset]; setVisibility takes a map or an
 * updater, so it can be passed straight to `onColumnVisibilityChange`.
 */
export function useColumnVisibility(storageKey, defaults) {
  const [visibility, setState] = useState(() => ({
    ...defaults,
    ...(storageGet([storageKey])[storageKey] || {}),
  }));

  const setVisibility = useCallback(
    (updater) => {
      setState((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        storageSet({ [storageKey]: next });
        return next;
      });
    },
    [storageKey],
  );

  const reset = useCallback(
    () => setVisibility({ ...defaults }),
    // `defaults` is a module constant on every caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setVisibility],
  );

  return [visibility, setVisibility, reset];
}
