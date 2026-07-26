"use client";

import { useEffect, useState } from "react";

/**
 * Holds the text for an aria-live region, only updating when the message
 * value itself changes. A parent can recompute the same announcement on
 * every render (e.g. a keystroke before search-debounce settles, or an
 * unrelated poll tick) without that re-deriving a new state update or
 * risking a redundant announcement — the effect's dependency comparison
 * is a plain string-value check, so same-text renders are no-ops.
 */
export function useLiveAnnouncer(message: string): string {
  const [announcement, setAnnouncement] = useState(message);

  useEffect(() => {
    setAnnouncement(message);
  }, [message]);

  return announcement;
}
