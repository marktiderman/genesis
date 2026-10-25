/**
 * The semantic icon names Genesis components ask for, and the SF Symbol each
 * one draws on iOS. Components say "settings" or "bell", never a library's
 * own name; `lucideIcons` (`/icons/lucide`) maps the same names for Android,
 * web and the SF Symbol fallback.
 *
 * @stability Beta
 */
export const SF_SYMBOLS = {
  "arrow-left": "arrow.left",
  bell: "bell",
  calendar: "calendar",
  check: "checkmark",
  "chevron-down": "chevron.down",
  "chevron-left": "chevron.left",
  "chevron-right": "chevron.right",
  "chevron-up": "chevron.up",
  clock: "clock",
  close: "xmark",
  edit: "pencil",
  error: "xmark.circle",
  "external-link": "arrow.up.right.square",
  filter: "line.3.horizontal.decrease",
  heart: "heart",
  home: "house",
  info: "info.circle",
  lock: "lock",
  "log-out": "rectangle.portrait.and.arrow.right",
  mail: "envelope",
  menu: "line.3.horizontal",
  minus: "minus",
  more: "ellipsis",
  plus: "plus",
  refresh: "arrow.clockwise",
  search: "magnifyingglass",
  settings: "gearshape",
  share: "square.and.arrow.up",
  star: "star",
  success: "checkmark.circle",
  trash: "trash",
  user: "person",
  warning: "exclamationmark.triangle",
} as const;

/** A semantic icon name: what the icon is for. */
export type NativeIconName = keyof typeof SF_SYMBOLS;

/** Every semantic icon name. */
export const NATIVE_ICON_NAMES = Object.keys(SF_SYMBOLS) as NativeIconName[];
