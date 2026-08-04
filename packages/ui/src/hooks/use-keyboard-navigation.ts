"use client";

import * as React from "react";
import { useState, useEffect, useCallback, useRef } from "react";

/** Elements that own their own key handling — never steal keys from these. */
const INTERACTIVE_TAGS = new Set(["BUTTON", "A", "SUMMARY"]);
const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "checkbox",
  "radio",
  "switch",
  "tab",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "textbox",
]);
/** Containers whose contents sit "above" the list and own their keys. */
const OVERLAY_SELECTOR =
  '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';

/**
 * Composite widgets that run their own key handling and may want Backspace
 * for themselves — type-ahead reset in a listbox/menu/tree, value editing in
 * a spinbutton/slider, "delete selection" in a canvas-based editor. ⌫ must
 * not be repurposed as "dismiss the overlay" while focus sits inside one.
 * A plain button or the dialog container itself is deliberately NOT here:
 * that is the common case after opening a detail panel, and dismissing is
 * exactly what ⌫ means there. `[data-keyboard-nav="off"]` is the explicit
 * escape hatch for anything this list cannot know about.
 */
const KEEPS_BACKSPACE_SELECTOR =
  'canvas, [role="listbox"], [role="menu"], [role="menubar"], [role="tree"],' +
  ' [role="grid"], [role="combobox"], [role="spinbutton"], [role="slider"],' +
  ' [data-keyboard-nav="off"]';

/** Whether `el` sits inside a widget that owns Backspace (see above). */
function keepsBackspace(el: HTMLElement | null): boolean {
  if (!el || typeof el.closest !== "function") return false;
  return el.closest(KEEPS_BACKSPACE_SELECTOR) !== null;
}

/** Text-entry surfaces: every key belongs to them (including Backspace). */
function isTypingTarget(el: HTMLElement | null): boolean {
  if (!el || typeof el.tagName !== "string") return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable === true
  );
}

/**
 * Live column count of a navigable container: the number of tracks in its
 * resolved `grid-template-columns`.
 *
 * Measuring beats being told. A responsive ramp (`sm:grid-cols-2
 * lg:grid-cols-3`) has no single column count a caller could pass in — the
 * answer depends on the viewport at the moment the key is pressed, which is
 * exactly what the computed style reports. Anything that isn't a CSS grid (a
 * list view's stacked rows, a bare test container) computes to `none`/empty
 * and counts as one column, preserving flat-list stepping.
 */
function measureColumns(container: HTMLElement | null): number {
  if (!container) return 1;
  const view = container.ownerDocument?.defaultView;
  if (typeof view?.getComputedStyle !== "function") return 1;
  const template = view.getComputedStyle(container).gridTemplateColumns;
  if (!template || template === "none") return 1;
  // Browsers resolve the track list to used values ("240px 240px 240px").
  // An unresolved *specified* value ("repeat(3, minmax(0, 1fr))") is not a
  // track list and its spaces don't count tracks — don't guess from it.
  if (template.includes("(")) return 1;
  const tracks = template.trim().split(/\s+/).filter(Boolean).length;
  return tracks > 0 ? tracks : 1;
}

/**
 * A focused control (or anything inside a dialog/menu/listbox) owns its own
 * keys — most importantly Enter and Space. Stealing those for the list
 * cursor is what makes an open overlay keyboard-hostile.
 */
function ownsItsKeys(el: HTMLElement | null): boolean {
  if (!el || typeof el.tagName !== "string") return false;
  if (INTERACTIVE_TAGS.has(el.tagName)) return true;
  const role = el.getAttribute?.("role");
  if (role && INTERACTIVE_ROLES.has(role)) return true;
  return (
    typeof el.closest === "function" && el.closest(OVERLAY_SELECTOR) !== null
  );
}

/**
 * Vim/Superhuman-style list navigation: j/k (or Arrow Up/Down) move a
 * focused-item cursor *one row at a time*, Enter opens the focused item, x
 * toggles its selection, and Backspace goes "back" (e.g. closes an open
 * detail view). In a multi-column grid the vertical keys step by the
 * container's live column count and Arrow Left/Right step by one, so the
 * cursor follows the grid the user can see rather than treating it as a flat
 * list. Intended for list/grid views such as `DataGrid` — attach
 * `containerRef` to the scrollable item container so the column count can be
 * measured and focus changes can scroll the focused item into view.
 *
 * Deliberately inert, so a default-on consumer can't break the surrounding
 * app: modified chords (Ctrl/Meta/Alt) are never captured, text-entry
 * surfaces keep every key, focused controls (or anything inside a
 * dialog/menu/listbox) keep theirs, composite widgets keep Backspace, and a
 * key that *does nothing* is never swallowed — Arrow Up/Down fall through to
 * the browser's page scrolling on an empty list, or at either end of a full
 * one, instead of dying silently.
 *
 * @stability Beta
 */
export interface KeyboardNavOptions {
  /** Total number of navigable items */
  itemCount: number;
  /** Called when Enter is pressed on focused item */
  onOpen?: (index: number) => void;
  /** Called when x is pressed on focused item */
  onToggleSelect?: (index: number) => void;
  /**
   * Called when Backspace (⌫) is pressed — the conventional "go back" key,
   * e.g. to close an open detail panel/modal and return to the list. Fires
   * regardless of whether an item is currently focused (mirrors Escape),
   * since "go back" should still work if a detail view was opened by mouse
   * click rather than keyboard navigation. Not gated behind `focusedIndex`.
   *
   * Backspace is only intercepted (and its default suppressed) while this
   * is supplied — pass it conditionally, i.e. only while there is something
   * to go back from, so the key stays available to the browser and the
   * surrounding app the rest of the time. Even then it is left alone for
   * text-entry surfaces and for composite widgets that use Backspace
   * themselves (see `KEEPS_BACKSPACE_SELECTOR`).
   */
  onBack?: (focusedIndex: number) => void;
  /** Ref to the search input to focus on "/" */
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  /** Whether navigation is enabled. Default true */
  enabled?: boolean;
  /**
   * Columns in the navigable grid. Drives the vertical stride: Arrow
   * Down/Up (and j/k) move by `columns`, Arrow Left/Right by one — so in a
   * 3-up grid ArrowDown moves *down* a row instead of one card to the right.
   *
   * Leave unset (the default) to measure the live count off `containerRef`'s
   * resolved `grid-template-columns` on each keypress, which is the only
   * value that stays correct across a responsive column ramp. Pass a number
   * only to override that measurement. Either way a single-column container
   * behaves exactly as a flat list: stride 1, Left/Right inert.
   */
  columns?: number;
  /**
   * An overlay (detail panel, modal, form) is open above the list. Cursor
   * movement and activation keys are suspended so they can't drive the list
   * hidden behind it, while the dismissal keys (`onBack`/Backspace, Escape)
   * stay live so the overlay can still be closed from the keyboard.
   * Default false.
   */
  overlayOpen?: boolean;
}

/** @stability Beta */
export interface KeyboardNavResult {
  /** Currently focused item index (-1 = none) */
  focusedIndex: number;
  /** Set focused index manually */
  setFocusedIndex: (index: number) => void;
  /** Ref to attach to the grid container for scroll management */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Whether keyboard nav is actively engaged (user has pressed j/k) */
  isActive: boolean;
}

/** @stability Beta */
export function useKeyboardNavigation({
  itemCount,
  onOpen,
  onToggleSelect,
  onBack,
  searchInputRef,
  enabled = true,
  columns,
  overlayOpen = false,
}: KeyboardNavOptions): KeyboardNavResult {
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [isActive, setIsActive] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  /**
   * Scrolling is requested by `step`, not inferred from `focusedIndex`
   * changing, for two reasons. (1) A *clamped* step leaves the index where
   * it was yet must still scroll — bringing the last rendered item back into
   * view is what trips `DataGrid`'s batch observer and lifts the ceiling
   * described on `navigableCount` below. (2) State updaters must be pure;
   * React StrictMode double-invokes them in development, so a scroll called
   * from inside one fires twice. Bumping a nonce keeps the updater pure and
   * moves the scroll into a committed effect, where the row it targets
   * actually exists in the DOM.
   */
  const [scrollRequest, setScrollRequest] = useState(0);
  const scrollInstantRef = useRef(false);

  // Reset when items change
  useEffect(() => {
    setFocusedIndex(-1);
    setIsActive(false);
  }, [itemCount]);

  const scrollToItem = useCallback((index: number, instant = false) => {
    if (!containerRef.current) return;
    const items = containerRef.current.querySelectorAll("[data-nav-item]");
    const item = items[index] as HTMLElement | undefined;
    if (item) {
      // Key-repeat fires faster than a smooth scroll settles, and a new
      // programmatic scroll can interrupt the in-flight one (MDN
      // scrollIntoView). Instant scroll under repeat lets the batch
      // IntersectionObserver see the sentinel before the next keydown.
      item.scrollIntoView({
        block: "nearest",
        behavior: instant ? "auto" : "smooth",
      });
    }
  }, []);

  /**
   * How far the cursor may travel *right now*. A batched grid (see
   * `DataGrid`'s infinite-scroll batching) renders only a slice of
   * `itemCount`, so the DOM — not the data length — is the real ceiling.
   * Walking past the rendered slice would drop the focus ring and leave
   * Enter/x acting on a row the user cannot see.
   *
   * Stopping at the last rendered item is self-healing: `scrollToItem`
   * brings it into view, which trips the batch observer, which renders the
   * next batch — so the next keypress continues where this one stopped.
   * (Do not feed the rendered count into `itemCount` — the reset effect
   * above clears focus whenever `itemCount` changes.)
   */
  const navigableCount = useCallback(() => {
    const container = containerRef.current;
    if (!container) return itemCount;
    const rendered = container.querySelectorAll("[data-nav-item]").length;
    // No nav items marked up (a view that doesn't opt in) — trust itemCount.
    return rendered > 0 ? Math.min(rendered, itemCount) : itemCount;
  }, [itemCount]);

  /**
   * Where an *unset* cursor should land on its first move: the first item
   * that is still at or below the top of the viewport, so a user who has
   * scrolled halfway down a long grid isn't yanked back to item 0 by their
   * first ArrowDown. Returns -1 when geometry can't answer (no layout, no
   * container, everything scrolled past), leaving the caller on item 0.
   */
  const firstVisibleIndex = useCallback((): number => {
    const container = containerRef.current;
    const view = container?.ownerDocument?.defaultView;
    if (!container || !view) return -1;
    const viewportBottom =
      view.innerHeight || container.ownerDocument.documentElement.clientHeight;
    if (!viewportBottom) return -1;
    const items = container.querySelectorAll("[data-nav-item]");
    for (let i = 0; i < items.length; i++) {
      const rect = (items[i] as HTMLElement).getBoundingClientRect();
      // A zero-height rect means "no layout information" (jsdom, display:none)
      // rather than "at the very top" — skip rather than guess.
      if (rect.height <= 0 && rect.width <= 0) continue;
      if (rect.bottom > 0 && rect.top < viewportBottom) return i;
    }
    return -1;
  }, []);

  /**
   * Move the cursor by `delta` and report whether the keystroke actually did
   * something. The caller uses the return value to decide whether to
   * `preventDefault()`: a default-on hook that swallows ArrowUp/Down even
   * when it has nothing to move would silently take page scrolling away from
   * every existing consumer — worst of all on an empty page, where there is
   * no cursor at all.
   */
  const step = useCallback(
    (delta: number, instant = false): boolean => {
      const max = navigableCount();
      // Empty / not-yet-mounted list: no cursor exists, so the key is not
      // ours. (Also guards the upward clamp from inventing index 0.)
      if (max <= 0) return false;

      const current = focusedIndex;
      const next =
        current < 0
          ? // First move from "nothing focused" adopts the top visible item
            // whichever direction it came from, rather than the row a
            // stride-sized jump would land on.
            Math.min(Math.max(firstVisibleIndex(), 0), max - 1)
          : delta > 0
            ? Math.min(current + delta, max - 1)
            : Math.max(current + delta, 0);

      if (next === current) {
        // Pinned at the *rendered* ceiling while more rows exist: scrolling
        // the last rendered item into view trips DataGrid's batch observer,
        // so the next keypress continues (see `navigableCount`). That is
        // real work, so the key stays ours.
        if (delta > 0 && max < itemCount) {
          scrollInstantRef.current = instant;
          setScrollRequest((n) => n + 1);
          return true;
        }
        // Genuinely at the top or the end of the data — hand the key back so
        // the browser can scroll the page.
        return false;
      }

      setIsActive(true);
      setFocusedIndex(next);
      scrollInstantRef.current = instant;
      setScrollRequest((n) => n + 1);
      return true;
    },
    [focusedIndex, firstVisibleIndex, itemCount, navigableCount],
  );

  // Committed scroll: the row exists in the DOM by the time this runs.
  useEffect(() => {
    // 0 = no step taken yet. A negative index is the Escape/itemCount-reset
    // path, where scrolling to a stale row would yank the viewport.
    if (scrollRequest === 0 || focusedIndex < 0) return;
    scrollToItem(focusedIndex, scrollInstantRef.current);
  }, [scrollRequest, focusedIndex, scrollToItem]);

  /**
   * Columns to step per vertical key press, measured live unless the caller
   * pinned it with the `columns` option.
   */
  const columnCount = useCallback((): number => {
    if (typeof columns === "number") return Math.max(1, Math.floor(columns));
    return measureColumns(containerRef.current);
  }, [columns]);

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      // Never hijack a modified chord. Cmd/Ctrl+K (command palettes),
      // Cmd/Ctrl+X (cut), Alt+Arrow (browser history) and friends belong to
      // the app or the browser — a default-on list must not eat them.
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const target = e.target as HTMLElement | null;

      // Don't capture when typing in inputs/textareas
      if (isTypingTarget(target)) {
        // Only handle Escape to blur out of search
        if (e.key === "Escape") {
          target?.blur();
          e.preventDefault();
        }
        return;
      }

      // ── Dismissal keys — live even while an overlay covers the list,
      // since dismissing that overlay is exactly what they are for. Handled
      // ahead of the interactive-target guard below so ⌫ still works when
      // focus sits on the dialog itself (or a button inside it).
      if (e.key === "Backspace") {
        if (onBack && !keepsBackspace(target)) {
          e.preventDefault();
          onBack(focusedIndex);
        }
        return;
      }
      if (e.key === "Escape") {
        setFocusedIndex(-1);
        setIsActive(false);
        return;
      }

      // A focused control owns its own keys — notably Enter/Space. Without
      // this, Enter on a dialog's button would be prevented and re-trigger
      // the list's "open focused row" instead of activating the button.
      if (ownsItsKeys(target)) return;

      // Everything below moves or acts on the list cursor.
      if (overlayOpen) return;

      // Vertical keys move a whole row; horizontal keys move one cell. In a
      // single-column container the two are the same stride, which is why a
      // list keeps behaving exactly as before.
      switch (e.key) {
        case "j":
        case "ArrowDown": {
          // preventDefault only if the cursor moved: see `step`.
          if (step(columnCount(), e.repeat)) e.preventDefault();
          break;
        }
        case "k":
        case "ArrowUp": {
          if (step(-columnCount(), e.repeat)) e.preventDefault();
          break;
        }
        case "ArrowRight": {
          if (columnCount() <= 1) break;
          if (step(1, e.repeat)) e.preventDefault();
          break;
        }
        case "ArrowLeft": {
          if (columnCount() <= 1) break;
          if (step(-1, e.repeat)) e.preventDefault();
          break;
        }
        case "Enter": {
          // Re-check the live rendered ceiling — focus can outlive a
          // shrunk batch (filter/reset) without `itemCount` changing.
          if (
            focusedIndex >= 0 &&
            focusedIndex < navigableCount() &&
            onOpen
          ) {
            e.preventDefault();
            onOpen(focusedIndex);
          }
          break;
        }
        case "x": {
          if (
            focusedIndex >= 0 &&
            focusedIndex < navigableCount() &&
            onToggleSelect
          ) {
            e.preventDefault();
            onToggleSelect(focusedIndex);
          }
          break;
        }
        case "/": {
          if (searchInputRef?.current) {
            e.preventDefault();
            searchInputRef.current.focus();
          }
          break;
        }
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [
    enabled,
    overlayOpen,
    focusedIndex,
    onOpen,
    onToggleSelect,
    onBack,
    searchInputRef,
    step,
    navigableCount,
    columnCount,
  ]);

  return {
    focusedIndex,
    setFocusedIndex,
    containerRef,
    isActive,
  };
}
