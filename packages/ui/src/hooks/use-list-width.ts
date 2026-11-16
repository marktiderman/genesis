"use client";

import { createContext, useCallback, useEffect, useRef, useState, type RefCallback } from "react";

/**
 * Below this width (in rem, so it follows the person's font size) a list's own frame is "narrow":
 * a table there can't show its columns, so a responsive default (`{ mobile, desktop }`) takes its
 * `mobile` side. 40rem is Tailwind's `sm` (640px at the default 16px). A viewport below the mobile
 * breakpoint (768px: a phone, in either orientation) is narrow too, whatever the frame measures.
 */
export const LIST_NARROW_REM = 40;

/**
 * Whether the nearest list frame is narrow (`useListWidth`), or undefined outside one or before it
 * has been measured. `useViewPreference` reads it beside the viewport, so a list is narrow on a phone
 * and also in a 360px side panel on a wide screen (docs/RESPONSIVE.md, rule 4). ResourcePage resets
 * it for what it renders inside (its peek, its forms), so the flag never reaches another list
 * through a portal.
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
 *
 * The ref may go on a `display: contents` wrapper, which has no box of its own and so changes no
 * layout: its first element child is measured instead, and followed when it changes. Widths are
 * layout widths (`offsetWidth`), so a transform (a dialog zooming in) doesn't make a list flip.
 */
export function useListWidth<E extends HTMLElement = HTMLDivElement>(): [RefCallback<E>, boolean | undefined] {
  const [narrow, setNarrow] = useState<boolean | undefined>(undefined);
  const cleanup = useRef<(() => void) | null>(null);
  const ref = useCallback((el: E | null) => {
    cleanup.current?.();
    cleanup.current = null;
    if (!el || typeof ResizeObserver === "undefined") return;
    const box = (): HTMLElement | null =>
      window.getComputedStyle(el).display === "contents" ? (el.firstElementChild as HTMLElement | null) : el;
    const measure = (target: HTMLElement | null) => {
      const width = target?.offsetWidth ?? 0;
      if (width > 0) setNarrow(width < LIST_NARROW_REM * remPx());
    };
    const ro = new ResizeObserver((entries) => measure(entries[entries.length - 1]?.target as HTMLElement | null));
    let watched = box();
    if (watched) ro.observe(watched);
    measure(watched);
    // The wrapper's child changes when the list's type does (a table, then a board): follow it.
    const mo = typeof MutationObserver === "undefined" ? null : new MutationObserver(() => {
      const next = box();
      if (next === watched) return;
      if (watched) ro.unobserve(watched);
      watched = next;
      if (watched) ro.observe(watched);
      measure(watched);
    });
    mo?.observe(el, { childList: true });
    cleanup.current = () => {
      ro.disconnect();
      mo?.disconnect();
    };
  }, []);
  useEffect(() => () => cleanup.current?.(), []);
  return [ref, narrow];
}
