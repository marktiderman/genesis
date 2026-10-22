import { useCallback, useEffect, useRef } from "react";

export const DEFAULT_UNSAVED_CHANGES_MESSAGE =
  "You have unsaved changes. Leave without saving?";

export interface UseUnsavedChangesGuardOptions {
  /** Guard while this is true (e.g. a form is dirty). */
  when: boolean;
  /** The question `confirmLeave` asks. */
  message?: string;
  /**
   * How to ask. Default `window.confirm`. Must answer synchronously, since
   * router blockers and `beforeunload` cannot wait.
   */
  confirm?: (message: string) => boolean;
}

export interface UseUnsavedChangesGuardReturn {
  /** True while leaving would lose changes. */
  isBlocking: boolean;
  /**
   * Call before leaving in-app (closing a dialog, a router blocker). Returns
   * true when it is fine to leave: nothing to lose, or the user said so.
   */
  confirmLeave: () => boolean;
}

/**
 * Warns before unsaved changes are lost, without depending on a router.
 *
 * - While `when` is true, closing or reloading the tab shows the browser's
 *   own "Leave site?" prompt (`beforeunload`).
 * - `confirmLeave()` is for in-app navigation: wire it to your router's
 *   blocker (React Router `useBlocker`, TanStack Router `useBlocker`), or call
 *   it before closing a dialog. See SKILL.md "Unsaved changes".
 */
export function useUnsavedChangesGuard(
  options: UseUnsavedChangesGuardOptions,
): UseUnsavedChangesGuardReturn {
  const { when, message = DEFAULT_UNSAVED_CHANGES_MESSAGE, confirm } = options;
  const whenRef = useRef(when);
  whenRef.current = when;
  const messageRef = useRef(message);
  messageRef.current = message;
  const confirmRef = useRef(confirm);
  confirmRef.current = confirm;

  useEffect(() => {
    if (!when || typeof window === "undefined") return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older browsers need returnValue set to show the prompt.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [when]);

  const confirmLeave = useCallback((): boolean => {
    if (!whenRef.current) return true;
    const ask =
      confirmRef.current ??
      (typeof window !== "undefined" && typeof window.confirm === "function"
        ? (text: string) => window.confirm(text)
        : () => true);
    return ask(messageRef.current);
  }, []);

  return { isBlocking: when, confirmLeave };
}
