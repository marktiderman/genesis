import { useEffect } from "react";

/** The default: ⌘⇧. on a Mac, Ctrl+Shift+. elsewhere. */
export const FEEDBACK_SHORTCUT = { key: ".", shift: true, mod: true } as const;

export interface FeedbackShortcut {
  /** `KeyboardEvent.key`, matched without case. */
  key: string;
  shift?: boolean | undefined;
  /** ⌘ on a Mac, Ctrl elsewhere. */
  mod?: boolean | undefined;
  alt?: boolean | undefined;
}

/** Does this key press match the shortcut? */
export function matchesShortcut(event: KeyboardEvent, shortcut: FeedbackShortcut = FEEDBACK_SHORTCUT): boolean {
  const mod = event.metaKey || event.ctrlKey;
  // With Shift held, "." arrives as ">" on most layouts; `code` names the key itself.
  const key = event.key.toLowerCase() === shortcut.key.toLowerCase() || (shortcut.key === "." && event.code === "Period");
  return key && !!shortcut.mod === mod && !!shortcut.shift === event.shiftKey && !!shortcut.alt === event.altKey;
}

/** Inside a rich-text editor (contenteditable), which may use the same keys. */
function inEditor(target: EventTarget | null): boolean {
  const el = target as { isContentEditable?: boolean; closest?: (s: string) => Element | null } | null;
  return !!el && (el.isContentEditable === true || !!el.closest?.('[contenteditable=""], [contenteditable="true"]'));
}

/**
 * Opens feedback from anywhere on the page with a key press (default ⌘⇧. / Ctrl+Shift+.). The
 * press counts as the person's gesture, so the panel may ask to capture the tab right away.
 */
export function useFeedbackShortcut(open: () => void, shortcut: FeedbackShortcut | false = FEEDBACK_SHORTCUT) {
  useEffect(() => {
    if (!shortcut || typeof window === "undefined") return;
    const onKey = (event: KeyboardEvent) => {
      // A held key repeats: once per press. A rich-text editor keeps its own shortcuts.
      if (event.repeat || !matchesShortcut(event, shortcut) || inEditor(event.target)) return;
      event.preventDefault();
      open();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, shortcut]);
}
