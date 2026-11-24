/**
 * Chat's colors, as Apple's Messages draws them: the roles genesis-chat's native screens paint
 * with, so a conversation looks like Messages whatever the tenant's brand. The brand stays on the
 * rest of the app; a brand swap never moves these.
 *
 * Where Messages uses an iOS system color, the role is that color (`PlatformColor`), so it follows
 * light and dark, Increase Contrast and the system's own changes. Where Messages draws a color of
 * its own (the received bubble's grey, the + list's icon circles, the glass fallbacks), the role
 * names it here, once, per scheme. Off iOS every role is its light or dark value.
 *
 * ```ts
 * import { Platform, PlatformColor } from "react-native";
 * const chat = resolveChatRoles({ target: Platform.OS === "ios" ? "ios" : "android", scheme, platformColor: PlatformColor });
 * ```
 *
 * @stability Beta
 */

/** @stability Beta */
export const CHAT_ROLES = [
  /** Your bubbles, the unread dot, Send, links in a received bubble: systemBlue. */
  "sent",
  /** Text on a sent bubble. */
  "onSent",
  /** Their bubbles. */
  "received",
  /** Text on a received bubble: label. */
  "onReceived",
  /** The page behind the transcript and the inbox: systemBackground. */
  "page",
  /** The page as a plain color string, for what is cut from it (a bubble's tail). */
  "pageSolid",
  /** The bar titles, as a plain color string (a header title style takes no system color). */
  "titleSolid",
  /** A pressed row, an open swipe's pill: systemGray5. */
  "pressed",
  /** Hide Alerts' bell and button: systemIndigo. */
  "muted",
  /** Pin: systemOrange. */
  "pinned",
  /** Details' grouped cards. */
  "card",
  /** A floating menu's surface without Liquid Glass. */
  "menu",
  /** A panel under glass (the composer's field without Liquid Glass). */
  "panel",
  /** The softened screen behind a long-press menu. */
  "scrim",
  /** A face without a photo: its gradient's top and bottom, and the flat fill. */
  "avatarTop",
  "avatarBottom",
  "avatarFlat",
  /** White on a colored circle: Send's arrow, the + list's icons, initials. */
  "onAccent",
  /** The shadow under a floating glass panel or menu. */
  "shadow",
] as const;

/** @stability Beta */
export type ChatRole = (typeof CHAT_ROLES)[number];

/** The + list's round icons, colored as Messages colors them. @stability Beta */
export const CHAT_ACCENTS = ["camera", "photos", "audio", "video", "schedule", "replies", "recap", "location", "stickers"] as const;

/** @stability Beta */
export type ChatAccent = (typeof CHAT_ACCENTS)[number];

interface Source {
  /** The iOS system color, when Messages uses one. */
  ios?: string;
  light: string;
  dark: string;
}

const SOURCES: Record<ChatRole, Source> = {
  sent: { ios: "systemBlue", light: "#007AFF", dark: "#0A84FF" },
  onSent: { light: "#FFFFFF", dark: "#FFFFFF" },
  received: { light: "#E9E9EB", dark: "#262628" },
  onReceived: { ios: "label", light: "#000000", dark: "#FFFFFF" },
  page: { ios: "systemBackground", light: "#FFFFFF", dark: "#000000" },
  pageSolid: { light: "#FFFFFF", dark: "#000000" },
  titleSolid: { light: "#000000", dark: "#FFFFFF" },
  pressed: { ios: "systemGray5", light: "#E5E5EA", dark: "#2C2C2E" },
  muted: { ios: "systemIndigo", light: "#5856D6", dark: "#5E5CE6" },
  pinned: { ios: "systemOrange", light: "#FF9500", dark: "#FF9F0A" },
  card: { ios: "secondarySystemBackground", light: "#F2F2F7", dark: "#1C1C1E" },
  menu: { light: "rgba(255,255,255,0.72)", dark: "rgba(58,58,62,0.75)" },
  panel: { light: "#F6F6F8", dark: "#2C2C2E" },
  scrim: { light: "rgba(214,214,219,0.82)", dark: "rgba(0,0,0,0.6)" },
  avatarTop: { light: "#A5AAB5", dark: "#6E6E73" },
  avatarBottom: { light: "#858994", dark: "#48484C" },
  avatarFlat: { light: "#9599A4", dark: "#5C5C61" },
  onAccent: { light: "#FFFFFF", dark: "#FFFFFF" },
  shadow: { light: "#000000", dark: "#000000" },
};

/** Messages' + list colors: the same in light and dark, as Messages keeps them. */
const ACCENTS: Record<ChatAccent, Source> = {
  camera: { light: "#3A3A3C", dark: "#3A3A3C" },
  photos: { ios: "systemOrange", light: "#FF9500", dark: "#FF9500" },
  audio: { ios: "systemRed", light: "#FF3B30", dark: "#FF3B30" },
  video: { ios: "systemPink", light: "#FF2D55", dark: "#FF2D55" },
  schedule: { ios: "systemBlue", light: "#007AFF", dark: "#007AFF" },
  replies: { ios: "systemGreen", light: "#34C759", dark: "#34C759" },
  recap: { ios: "systemIndigo", light: "#5856D6", dark: "#5856D6" },
  location: { ios: "systemGreen", light: "#34C759", dark: "#34C759" },
  stickers: { ios: "systemPurple", light: "#AF52DE", dark: "#AF52DE" },
};

/** @stability Beta */
export interface ResolveChatRolesOptions<C> {
  target: "ios" | "android" | "web";
  scheme?: "light" | "dark";
  /** React Native's `PlatformColor`: on iOS, the roles Messages draws in system colors become them. */
  platformColor?: (name: string) => C;
}

/** @stability Beta */
export interface ChatRoleColors<C = string> {
  roles: Record<ChatRole, string | C>;
  accents: Record<ChatAccent, string | C>;
}

/** Every chat role and + list accent for one platform and scheme. @stability Beta */
export function resolveChatRoles<C = string>(options: ResolveChatRolesOptions<C>): ChatRoleColors<C> {
  const { target, scheme = "light", platformColor } = options;
  const pick = (s: Source): string | C => (target === "ios" && platformColor && s.ios ? platformColor(s.ios) : s[scheme]);
  const roles = {} as Record<ChatRole, string | C>;
  for (const role of CHAT_ROLES) roles[role] = pick(SOURCES[role]);
  const accents = {} as Record<ChatAccent, string | C>;
  for (const accent of CHAT_ACCENTS) accents[accent] = pick(ACCENTS[accent]);
  return { roles, accents };
}
