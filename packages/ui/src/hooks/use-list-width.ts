"use client";

import { createContext, useCallback, useEffect, useRef, useState, type RefCallback } from "react";

/**
 * Below this width (in rem, so it follows the person's font size) a list is "narrow": a table
 * there can't show its columns, so a responsive default (`{ mobile, desktop }`) takes its
 * `mobile` side. 40rem is Tailwind's `sm` (640px at the default 16px), which a phone's content
 * area never reaches and a tablet's or desktop's main column always passes.
 */
export const LIST_NARROW_REM = 40;

/**
 * Whether the nearest list frame is narrow (`useListWidth`), or undefined outside one or before it
 * has been measured. `useViewPreference` reads it before the viewport, so a list answers to its own
 * width: rows in a 360px side panel on a wide screen, a table in a wide main column on a tablet
 * (docs/RESPONSIVE.md, rules 1 and 4).
 */
export const ListNarrowContext = createContext<boolean | undefined>(undefined);

function remPx(): number {
  if (typeof window === "undefined") return 16;
  const size = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(size) && size > 0 ? size : 16;
}

/**
 * Measures the element the returned ref is put on and says whether it is narrower than
 * `LIST_NARROW_REM`. Undefined until the first measurement (and on the server), so the first
 * client render matches the server's HTML and the viewport decides until then.
 */
export function useListWidth<E extends HTMLElement = HTMLDivElement>(): [RefCallback<E>, boolean | undefined] {
  const [narrow, setNarrow] = useState<boolean | undefined>(undefined);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: E | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = (width: number) => {
      if (width <= 0) return;
      setNarrow(width < LIST_NARROW_REM * remPx());
    };
    measure(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) measure(entry.contentRect.width);
    });
    ro.observe(el);
    observer.current = ro;
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);
  return [ref, narrow];
}
