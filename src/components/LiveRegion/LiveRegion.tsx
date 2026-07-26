"use client";

import { VisuallyHidden } from "@chakra-ui/react";

type LiveRegionProps = {
  message: string;
  politeness?: "polite" | "assertive";
};

/**
 * Visually-hidden aria-live region for announcing dynamic content changes
 * (table refresh, sort, pagination, search results) to assistive tech.
 * `role="status"` gives older screen readers a fallback announcement path
 * on top of aria-live for browsers/AT that don't watch it directly.
 */
export default function LiveRegion({
  message,
  politeness = "polite",
}: LiveRegionProps) {
  return (
    <VisuallyHidden aria-live={politeness} aria-atomic="true" role="status">
      {message}
    </VisuallyHidden>
  );
}
