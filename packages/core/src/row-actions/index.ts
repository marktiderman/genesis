/**
 * Row actions: one platform-neutral shape for an action on a list row, the same everywhere a
 * row offers it (ADR 0028): behind a swipe on the phone, in its long-press menu (the system
 * context menu, or a sheet), and as a screen reader's actions. InboxPage's rows,
 * NativeResourceView's, `NativeListItem`'s `actions` and `NativeSwipeRow` all take it; a view's
 * actions (`defineView`) map onto it.
 *
 * @stability Beta
 */

/** Which edge of a row a swipe uncovers an action from: leading is a swipe to the right (in a left-to-right language). */
export type RowActionSide = "leading" | "trailing";

/**
 * What an action means, which each platform draws in its own colors (on iOS, the system colors
 * Mail and Messages use):
 *
 * | Tone      | iOS           | Use                                    |
 * | --------- | ------------- | -------------------------------------- |
 * | `tint`    | the app's primary | the default for an action that isn't destructive |
 * | `danger`  | systemRed     | delete, leave: the default when `destructive` |
 * | `success` | systemGreen   | approve, mark done                     |
 * | `warning` | systemOrange  | flag, needs attention                  |
 * | `info`    | systemBlue    | mark read or unread, details           |
 * | `neutral` | systemGray    | more, mute                             |
 *
 * When an app matches a system app's look exactly where no meaning fits (Messages' indigo Hide
 * Alerts, its orange Pin), it names the color with `accent` instead.
 */
export type RowActionTone = "tint" | "danger" | "success" | "warning" | "info" | "neutral";

/** Every {@link RowActionTone}, for validating input. */
export const ROW_ACTION_TONES: readonly RowActionTone[] = Object.freeze(["tint", "danger", "success", "warning", "info", "neutral"]);

/**
 * A system color by name, for an action that must match a system app's look rather than say what
 * it means (Messages: Unread blue, Pin orange, Hide Alerts indigo, Delete red). Wins over `tone`.
 */
export type RowActionAccent = "blue" | "green" | "orange" | "purple" | "indigo" | "yellow" | "gray" | "red";

/** Every {@link RowActionAccent}, for validating input. */
export const ROW_ACTION_ACCENTS: readonly RowActionAccent[] = Object.freeze(["blue", "green", "orange", "purple", "indigo", "yellow", "gray", "red"]);

/** Where an action sits behind a row's swipe: its side, and whether a full swipe runs it. */
export interface RowActionSwipe {
  readonly side: RowActionSide;
  /**
   * A full swipe runs it, as Mail's Delete and Archive do: the row's first action on its side
   * with `full` is the one a drag past 0.6 of the row's width triggers when let go. Off by default.
   * A destructive one must say it `confirms`: one gesture is easy to make by mistake.
   */
  readonly full?: boolean;
}

/**
 * One of a row's actions.
 *
 * `confirms` and a view action's `confirm` differ on purpose: a row action's `onPress` is the
 * app's own code, so the app asks (an alert, an undo) and the flag only says that it does; a view
 * action runs through the data provider, so the view gives the words and NativeResourceView asks
 * them before it runs, then marks the row action `confirms`.
 */
export interface RowSwipeAction {
  id: string;
  label: string;
  onPress: () => void;
  /** Destructive (delete, leave): `danger` unless a `tone` or `accent` says otherwise. */
  destructive?: boolean;
  /**
   * Where it sits behind the swipe on the phone: `{ side, full? }`, or `false` to keep it in the
   * long-press menu and the screen reader's actions only (an action that needs a second look).
   * Unset: the trailing side, no full swipe (NativeResourceView keeps a view action that didn't
   * say to its menu).
   */
  swipe?: RowActionSwipe | false;
  /** @deprecated Use `swipe: { side }`. Read when `swipe` is unset. */
  side?: RowActionSide;
  /**
   * A Genesis icon name (`trash`, `pin`, `mail-open`), shown behind the swipe and in the menu.
   * A string here, because core is platform-neutral and each platform keeps its own icon set:
   * genesis-ui-native's `NativeIconName` and `isNativeIconName` check it on the phone (an unknown
   * name draws no icon, with a development warning).
   */
  icon?: string;
  /** What it means; its color comes from that. Default `danger` when destructive, else `tint`. */
  tone?: RowActionTone;
  /** A system color by name, over `tone` (see {@link RowActionAccent}). */
  accent?: RowActionAccent;
  /** Its `onPress` asks first or can be undone, so a full swipe that runs it by mistake loses nothing. */
  confirms?: boolean;
  /** Set when a guard refuses it: pressing it explains instead of acting, and screen readers hear why. */
  reason?: string;
}

/** Where an action sits behind the swipe: `swipe`, else the deprecated `side`, else trailing. `false` keeps it off the swipe. */
export function rowActionSwipe(action: Pick<RowSwipeAction, "swipe" | "side">): RowActionSwipe | false {
  if (action.swipe === false) return false;
  if (action.swipe) return action.swipe;
  return { side: action.side ?? "trailing" };
}

/** Whether the action said where it swipes (`swipe`, or the deprecated `side`). */
export function rowActionPlaced(action: Pick<RowSwipeAction, "swipe" | "side">): boolean {
  return action.swipe !== undefined || action.side !== undefined;
}

/** The action's tone: its own, else `danger` when destructive, else `tint`. */
export function rowActionTone(action: Pick<RowSwipeAction, "tone" | "destructive">): RowActionTone {
  return action.tone ?? (action.destructive ? "danger" : "tint");
}

/** A screen reader's label for it: the label, with the refusal's reason when a guard refused it. */
export function rowActionLabel(action: Pick<RowSwipeAction, "label" | "reason">): string {
  return action.reason ? `${action.label}: ${action.reason}` : action.label;
}
