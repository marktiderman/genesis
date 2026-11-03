/**
 * Keyboard helpers shared by the gallery patterns.
 *
 * @stability Beta
 */

/** Roles whose own arrow/letter handling must not be hijacked by an app shortcut. */
const SHORTCUT_BLOCKING_ROLES = new Set([
  "listbox",
  "menu",
  "slider",
  "combobox",
  "radiogroup",
  "tablist",
]);

const SHORTCUT_BLOCKING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT", "VIDEO", "AUDIO"]);

type AnyKeyboardEvent = Pick<
  KeyboardEvent,
  "defaultPrevented" | "ctrlKey" | "metaKey" | "altKey" | "target"
>;

/**
 * Whether a keydown is a fair target for an app-level shortcut: nothing has
 * claimed it (`defaultPrevented`), no ctrl/meta/alt modifier is held (those
 * are the browser's and the OS's), and focus is not inside something that
 * types or has its own key handling — input, textarea, select, video, audio,
 * `[contenteditable]`, or an element with (or inside one with) the role
 * listbox, menu, slider, combobox, radiogroup or tablist.
 *
 * `Lightbox` runs every unhandled keydown through this before calling
 * `onKey`, so a consumer's "f to favourite" never fires while the user types
 * a caption. Works with a DOM `KeyboardEvent` or React's wrapper.
 *
 * @internal Not exported from the package: Lightbox's own guard.
 */
export function isAppShortcutTarget(e: AnyKeyboardEvent): boolean {
  if (e.defaultPrevented) return false;
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  return isAppShortcutTargetElement(e.target);
}

/**
 * Whether `target` (or an ancestor) is a field or widget that owns its own
 * keys. Non-element targets pass. The element half of `isAppShortcutTarget`,
 * for guards on events without modifier keys, such as touch.
 */
export function isAppShortcutTargetElement(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;

  let node: Element | null = target;
  while (node) {
    if (SHORTCUT_BLOCKING_TAGS.has(node.tagName)) return false;
    const editable = node.getAttribute("contenteditable");
    if (editable !== null && editable !== "false") return false;
    const role = node.getAttribute("role");
    if (role && SHORTCUT_BLOCKING_ROLES.has(role)) return false;
    node = node.parentElement;
  }
  return true;
}
