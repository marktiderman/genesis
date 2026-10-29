"use client";

/**
 * The workspace switcher (docs/adr/0004-workspaces.md): which organization, roll-up or personal
 * space the viewer is working in, at the top of AppShell's sidebar (`headerSlot`), as a picture
 * on the collapsed rail (`collapsedHeaderSlot`) and as the title of the phone's top bar
 * (`mobileHeaderSlot`). Each choice is a link, so switching changes the URL and the browser's
 * back button undoes it.
 *
 * It reads `WorkspaceScope` (genesis-core) for the list, the current workspace and each link,
 * so in an app with a WorkspaceScope it takes no data props.
 *
 * Customizing it, from lightest to heaviest:
 *
 * - **Props**: group headings (`kindLabels`), pictures (`kindIcons`), badges, a search box
 *   (`search`, opt-in), keyboard shortcuts (`shortcuts`), the menu's last items (`actions`,
 *   `footer`).
 * - **Styling**: every element carries `data-scope="workspace-switcher"` and a `data-part`, plus
 *   state attributes (`data-state`, `data-current`, `data-kind`, `data-variant`,
 *   `data-highlighted`), so a stylesheet or Tailwind's `data-*` variants can reach any part.
 *   `classNames` adds classes per part (`classNames.content: "w-80"`, `classNames.image:
 *   "rounded-full"`). Colors are the design system's tokens (CSS variables), and a workspace's
 *   `theme.accent` re-points `--primary` on its own picture and row (`workspaceThemeStyle`).
 * - **Search**: without it the list is a Radix menu (`role="menu"`, typeahead). With it, it is a
 *   combobox: a text box (`role="combobox"`) that filters a `role="listbox"` of the workspaces,
 *   with ↑/↓ to move and Enter to go, because a text box can't sit inside a menu. In that mode
 *   `actions` render as buttons under the list, and `footer` must hold plain links or buttons, not
 *   menu items: pass `footer` as a function of the mode to give each mode its own. With
 *   `search="auto"`, a `footer` that is not a function keeps the menu (and warns in development).
 * - **Slots** (genesis-core's `slots`/`slotProps` contract): replace or drop a part (`image`,
 *   `item`, `badge`, `empty`, `search`), or pass a part more props (`slotProps`, which also
 *   reaches the `trigger` button and the menu `content`). `renderImage`, `renderItem` and
 *   `renderBadge` are the one-function shorthands.
 */
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ComponentType,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type Ref,
  type RefCallback,
} from "react";
import { Slot as SlotPrimitive } from "radix-ui";
import { Check, ChevronsUpDown, Layers, Search, UserRound, type LucideIcon } from "lucide-react";

import { useWorkspace } from "@marktiderman/genesis-core/hooks";
import {
  filterWorkspaces,
  groupWorkspaces,
  orderedWorkspaces,
  workspaceHref,
  workspaceInitials,
  WORKSPACE_KIND_ORDER,
  type Workspace,
  type WorkspaceKind,
} from "@marktiderman/genesis-core/workspaces";

import { cn } from "../../utils";
import { DefaultLink, type LinkComponent } from "../../navigation";
import { renderSlot, type SlotOverride } from "../../slots";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { brandThemeStyle } from "./brand-theme";

/** @stability Beta */
export type WorkspaceSwitcherVariant = "sidebar" | "rail" | "bar";

/**
 * The switcher's named parts. Each element carries `data-scope="workspace-switcher"` and
 * `data-part="<part>"`, and `classNames` takes a class for each.
 *
 * @stability Beta
 */
export type WorkspaceSwitcherPart =
  | "root"
  | "trigger"
  | "image"
  | "name"
  | "description"
  | "indicator"
  | "content"
  | "search"
  | "list"
  | "group"
  | "group-label"
  | "item"
  | "item-name"
  | "item-description"
  | "item-indicator"
  | "item-shortcut"
  | "badge"
  | "empty"
  | "separator"
  | "footer"
  | "action";

/** Every part, in document order; see {@link WorkspaceSwitcherPart}. */
export const WORKSPACE_SWITCHER_PARTS: readonly WorkspaceSwitcherPart[] = [
  "root",
  "trigger",
  "image",
  "name",
  "description",
  "indicator",
  "content",
  "search",
  "list",
  "group",
  "group-label",
  "item",
  "item-name",
  "item-description",
  "item-indicator",
  "item-shortcut",
  "badge",
  "empty",
  "separator",
  "footer",
  "action",
];

/** The value of every part's `data-scope`. */
export const WORKSPACE_SWITCHER_SCOPE = "workspace-switcher";

/** With `search="auto"`, past this many workspaces the menu opens with a search box. */
export const WORKSPACE_SWITCHER_SEARCH_THRESHOLD = 7;

/** The default heading over each kind's group in the menu. */
export const DEFAULT_WORKSPACE_KIND_LABELS: Readonly<Partial<Record<WorkspaceKind, string>>> = {
  personal: "Personal",
  rollup: "Overview",
  tenant: "Organizations",
};

/** The default picture for a kind with no image of its own; tenants show their initials. */
export const DEFAULT_WORKSPACE_KIND_ICONS: Readonly<Partial<Record<WorkspaceKind, LucideIcon>>> = {
  personal: UserRound,
  rollup: Layers,
};

/**
 * The CSS variables for a workspace's brand (`workspace.theme.accent`): `--primary`,
 * `--primary-foreground` and `--ring` pointed at an accessible shade of the accent, as
 * `brandThemeStyle` does for a public page. Empty without a valid accent. The switcher puts it on
 * each workspace's picture and row; an app can put the current workspace's on its shell to brand
 * everything inside.
 *
 * @stability Beta
 */
export function workspaceThemeStyle(workspace: Pick<Workspace, "theme"> | undefined): CSSProperties {
  return brandThemeStyle(workspace?.theme);
}

/**
 * A typed item at the bottom of the menu: "New organization", "Manage workspaces".
 *
 * @stability Beta
 */
export interface WorkspaceSwitcherAction {
  /** Unique among the actions; its test id is `workspace-switcher-action-<id>`. */
  id: string;
  label: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  /** A link (through `linkComponent`). Give this or `onSelect`. */
  href?: string;
  /** Runs when chosen (a dialog to create one). */
  onSelect?: () => void;
  /** A hint at the row's end, such as "⌘N". Display only: the app binds the key. */
  shortcut?: string;
  disabled?: boolean;
}

/**
 * Keyboard shortcuts. Both are off unless given, and when several switchers are mounted (sidebar,
 * rail, phone bar) only the one on screen answers.
 *
 * @stability Beta
 */
export interface WorkspaceSwitcherShortcuts {
  /**
   * Opens and closes the menu, as `mod+shift+o`: modifiers `mod` (⌘ on a Mac, Ctrl elsewhere),
   * `meta`/`cmd`, `ctrl`, `alt`/`option` and `shift`, joined by `+`, then the key: a letter, a
   * digit, `+`, or a named key as `KeyboardEvent.key` spells it (`enter`, `f2`). A key that Shift
   * changes, such as `shift+/` (which types `?`), never matches; name the key it types instead. A
   * key with no modifier is ignored while the viewer is typing. A spec with no key warns in
   * development and does nothing.
   */
  open?: string | false;
  /**
   * Go straight to the first nine workspaces, in the menu's order, and show each one's number in
   * the menu. `true` or `"alt"`: Alt+1 to Alt+9 (⌥ on a Mac), which browsers pass to the page.
   * `"mod"`: ⌘1 to ⌘9 (Ctrl elsewhere), best effort only: Chrome and most browsers keep these for
   * switching tabs and never pass them on, so use it in an installed or desktop-wrapped app.
   */
  jump?: boolean | "mod" | "alt";
}

/** What `slots.image` receives. */
export interface WorkspaceSwitcherImageProps<W extends Workspace = Workspace> {
  workspace: W;
  size: "sm" | "md";
  /** The kind's icon, for a workspace with no image. */
  icon?: LucideIcon;
  className?: string;
  /** The workspace's brand variables (`workspaceThemeStyle`). */
  style?: CSSProperties;
}

/** What `slots.item` receives: the row's content, inside the link and its menu item. */
export interface WorkspaceSwitcherItemProps<W extends Workspace = Workspace> {
  workspace: W;
  current: boolean;
  /** Its place in the menu's order, from 0 (the keyboard jump's number less one). */
  index: number;
  /** The rendered picture and badge, to place in a row of your own. */
  image: ReactNode;
  badge: ReactNode;
  /** The jump shortcut's hint ("⌘3"), when jumping is on and it has one. */
  shortcut?: string;
  classNames?: WorkspaceSwitcherClassNames;
}

/** What `slots.badge` receives. A replacement owns its screen-reader text: use `label`. */
export interface WorkspaceSwitcherBadgeProps<W extends Workspace = Workspace> {
  workspace: W;
  value: string | number;
  /** What a screen reader hears for it ("3 new"; see `badgeLabel`). The visible value is hidden from them. */
  label: string;
  className?: string;
}

/** What `slots.empty` receives: shown when a search matches nothing. */
export interface WorkspaceSwitcherEmptyProps {
  query: string;
  /** The switcher's `emptyText`. */
  children?: ReactNode;
  className?: string;
}

/** What `slots.search` receives. */
export interface WorkspaceSwitcherSearchProps {
  value: string;
  onValueChange: (value: string) => void;
  /** Put it on your input: ↑/↓ move through the list and Enter goes to the highlighted workspace. */
  onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  placeholder: string;
  /** Put it on your input: the switcher focuses it on opening. */
  inputRef: Ref<HTMLInputElement>;
  /** Spread on your input: the combobox's role and ARIA state. */
  comboboxProps: {
    role: "combobox";
    "aria-expanded": boolean;
    "aria-controls"?: string;
    "aria-activedescendant"?: string;
    "aria-autocomplete": "list";
  };
  className?: string;
}

/** The parts `slots` can replace, and what each receives. */
export interface WorkspaceSwitcherSlotMap<W extends Workspace = Workspace> {
  image: WorkspaceSwitcherImageProps<W>;
  item: WorkspaceSwitcherItemProps<W>;
  badge: WorkspaceSwitcherBadgeProps<W>;
  empty: WorkspaceSwitcherEmptyProps;
  search: WorkspaceSwitcherSearchProps;
}

/** Replace a part with your component (it gets what the default would), or drop it with `null`. */
export type WorkspaceSwitcherSlots<W extends Workspace = Workspace> = {
  [K in keyof WorkspaceSwitcherSlotMap<W>]?: SlotOverride<WorkspaceSwitcherSlotMap<W>[K]>;
};

/** More props for a part, merged over the switcher's (a `className` is added, not replaced). */
export type WorkspaceSwitcherSlotProps<W extends Workspace = Workspace> = {
  [K in keyof WorkspaceSwitcherSlotMap<W>]?: Partial<WorkspaceSwitcherSlotMap<W>[K]>;
} & {
  trigger?: Partial<ComponentProps<typeof Button>>;
  /** The menu (or, with search, the popover). Its `ref` is composed with the switcher's own. */
  content?: Partial<
    Pick<
      ComponentProps<typeof DropdownMenuContent>,
      "ref" | "id" | "className" | "style" | "align" | "alignOffset" | "side" | "sideOffset" | "collisionPadding" | "avoidCollisions"
    >
  >;
};

/** A class for each part, added to the switcher's own. */
export type WorkspaceSwitcherClassNames = Partial<Record<WorkspaceSwitcherPart, string>>;

/** @stability Beta */
export interface WorkspaceSwitcherProps<W extends Workspace = Workspace> {
  /**
   * `sidebar` (default): the full row for `headerSlot`. `rail`: the picture alone, for the
   * collapsed rail's `collapsedHeaderSlot`. `bar`: the name and a chevron, for the phone's top bar.
   */
  variant?: WorkspaceSwitcherVariant;
  /** Every workspace; defaults to the nearest WorkspaceScope's. */
  workspaces?: readonly W[];
  /** The current workspace; defaults to the nearest WorkspaceScope's. */
  current?: W;
  /** Where each choice goes; defaults to the WorkspaceScope's, else the workspace's landing page. */
  hrefFor?: (workspace: W) => string;
  /**
   * The router's link (see AppShell's `linkComponent`). Each row is this link with the menu item's
   * or option's props merged on, so it must pass `ref`, `id`, `role`, `aria-*`, `tabIndex`,
   * `onClick`, `onMouseMove`, `onKeyDown`, `style` and `data-*` through to its `<a>` (see
   * `LinkComponent`).
   */
  linkComponent?: LinkComponent;
  /**
   * How a keyboard jump (`shortcuts.jump`) goes to a workspace: pass the router's navigate. Without
   * it a jump is a full page load of the link (a menu click still uses `linkComponent`), and the
   * switcher warns in development.
   */
  onNavigate?: (href: string, workspace: W) => void;
  /** Called whenever the viewer picks a workspace, from the menu or the keyboard. */
  onSelect?: (workspace: W) => void;
  /** The order of the kinds in the menu (default personal, roll-up, tenants). */
  order?: readonly WorkspaceKind[];
  /** Headings over each kind's group; merged over the defaults. `null` hides a heading. */
  kindLabels?: Partial<Record<WorkspaceKind, string | null>>;
  /** Pictures for kinds without an image; merged over the defaults. */
  kindIcons?: Partial<Record<WorkspaceKind, LucideIcon>>;
  /** Replaces the picture (a brand mark, a colored tile). Shorthand for `slots.image`. */
  renderImage?: (workspace: W, size: "sm" | "md") => ReactNode;
  /** Replaces a row's content in the menu (the link around it stays). Shorthand for `slots.item`. */
  renderItem?: (workspace: W, state: { current: boolean }) => ReactNode;
  /**
   * Replaces a workspace's badge (default: its `badge`, as a pill). Shorthand for `slots.badge`.
   * A custom badge owns its screen-reader text: `badgeLabel` reaches only the default one.
   */
  renderBadge?: (workspace: W) => ReactNode;
  /**
   * What a screen reader hears for a badge, in place of the bare value. Default: "3 new" for a
   * number, the text itself otherwise.
   */
  badgeLabel?: (workspace: W, value: string | number) => string;
  /**
   * A search box over the list, which then becomes a combobox (see the module comment). Default
   * `false`. `"auto"` turns it on past {@link WORKSPACE_SWITCHER_SEARCH_THRESHOLD} workspaces.
   */
  search?: boolean | "auto";
  /** The search box's placeholder and accessible name. Default "Find a workspace". */
  searchPlaceholder?: string;
  /** Shown when a search matches nothing. Default "No workspaces found". */
  emptyText?: ReactNode;
  /** Keyboard shortcuts to open the menu and to jump to a workspace. Off by default. */
  shortcuts?: WorkspaceSwitcherShortcuts;
  /** Typed items at the bottom of the menu, after a separator. */
  actions?: readonly WorkspaceSwitcherAction[];
  /**
   * The menu's last items, after `actions`. In the menu they are menu items (`DropdownMenuItem`);
   * with search they must be plain links or buttons, since there is no menu around them. Pass a
   * function to render each mode's own: `(mode) => mode === "menu" ? <DropdownMenuItem … /> : <a … />`.
   */
  footer?: ReactNode | ((mode: "menu" | "search") => ReactNode);
  /** Replace or drop a part. */
  slots?: WorkspaceSwitcherSlots<W>;
  /** More props for a part, including the `trigger` button and the menu `content`. */
  slotProps?: WorkspaceSwitcherSlotProps<W>;
  /** A class for each part. `className` is the same as `classNames.root`. */
  classNames?: WorkspaceSwitcherClassNames;
  /** Whether the menu is open, to control it. */
  open?: boolean;
  /** Whether the menu starts open, uncontrolled. */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Shown when the URL is in no workspace. Default "Choose a workspace". */
  placeholder?: string;
  /** Accessible name of the trigger. Default "Switch workspace". */
  label?: string;
  className?: string;
}

const part = (name: WorkspaceSwitcherPart) => ({ "data-scope": WORKSPACE_SWITCHER_SCOPE, "data-part": name });
const flag = (on: boolean) => (on ? "" : undefined);

function hasBadge(value: Workspace["badge"]): value is string | number {
  return value !== undefined && value !== null && value !== "" && value !== 0;
}

const defaultBadgeLabel = (_w: Workspace, value: string | number) => (typeof value === "number" ? `${value} new` : String(value));

function composeRefs<T>(...refs: (Ref<T> | undefined)[]): RefCallback<T> {
  return (node) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as { current: T | null }).current = node;
    }
  };
}

/** The default picture: the workspace's image, else its kind's icon, else its initials. */
function DefaultWorkspaceImage<W extends Workspace>({ workspace, size, icon: Icon, className, style }: WorkspaceSwitcherImageProps<W>) {
  const ShownIcon = workspace.image ? undefined : Icon;
  return (
    <Avatar
      {...part("image")}
      data-kind={workspace.kind}
      data-size={size}
      className={cn("shrink-0 rounded-md", size === "sm" ? "size-6" : "size-8", className)}
      style={style}
      aria-hidden
    >
      {workspace.image ? <AvatarImage src={workspace.image} alt="" /> : null}
      <AvatarFallback
        className={cn(
          "rounded-md font-semibold",
          size === "sm" ? "text-[10px]" : "text-xs",
          workspace.kind === "tenant" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {ShownIcon ? <ShownIcon className={size === "sm" ? "size-3.5" : "size-4"} /> : workspaceInitials(workspace.label)}
      </AvatarFallback>
    </Avatar>
  );
}

/** The value is for sighted viewers; a screen reader hears `label` ("3 new") instead. */
function DefaultWorkspaceBadge<W extends Workspace>({ value, label, className }: WorkspaceSwitcherBadgeProps<W>) {
  return (
    <>
      <Badge {...part("badge")} variant="secondary" aria-hidden className={cn("shrink-0 px-1.5 py-0 tabular-nums", className)}>
        {value}
      </Badge>
      <span className="sr-only">{`, ${label}`}</span>
    </>
  );
}

function DefaultWorkspaceItem<W extends Workspace>({ workspace, current, image, badge, shortcut, classNames }: WorkspaceSwitcherItemProps<W>) {
  return (
    <>
      {image}
      <span className="flex min-w-0 flex-1 flex-col">
        <span {...part("item-name")} className={cn("truncate", classNames?.["item-name"])}>
          {workspace.label}
        </span>
        {workspace.description ? (
          <span
            {...part("item-description")}
            className={cn(
              "truncate text-xs text-muted-foreground group-data-[highlighted]/workspace-item:text-accent-foreground",
              classNames?.["item-description"],
            )}
          >
            {workspace.description}
          </span>
        ) : null}
      </span>
      {badge}
      {shortcut ? (
        // The row's aria-keyshortcuts names the key; the hint is for sighted viewers.
        <DropdownMenuShortcut {...part("item-shortcut")} aria-hidden className={cn("ml-0", classNames?.["item-shortcut"])}>
          {shortcut}
        </DropdownMenuShortcut>
      ) : null}
      {current ? <Check {...part("item-indicator")} className={cn("size-4 shrink-0", classNames?.["item-indicator"])} aria-hidden /> : null}
    </>
  );
}

function DefaultWorkspaceEmpty({ children, className }: WorkspaceSwitcherEmptyProps) {
  return (
    <div {...part("empty")} role="status" className={cn("px-2 py-4 text-center text-sm text-muted-foreground", className)}>
      {children}
    </div>
  );
}

function DefaultWorkspaceSearch({ value, onValueChange, onKeyDown, placeholder, inputRef, comboboxProps, className }: WorkspaceSwitcherSearchProps) {
  return (
    <div {...part("search")} className={cn("-mx-1 -mt-1 mb-1 flex items-center gap-2 border-b px-3", className)}>
      <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <input
        ref={inputRef}
        type="text"
        {...comboboxProps}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="h-9 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        data-testid="workspace-switcher-search"
      />
    </div>
  );
}

interface ParsedShortcut {
  key: string;
  mod: boolean;
  meta: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}

function parseShortcut(spec: string): ParsedShortcut | undefined {
  const tokens = spec
    .toLowerCase()
    .split("+")
    .map((t) => t.trim());
  // "mod++": the key is "+", which split into two empty tokens.
  const key = tokens.at(-1) === "" && tokens.at(-2) === "" ? (tokens.splice(-2), "+") : tokens.pop();
  if (!key) return undefined;
  const has = (...names: string[]) => tokens.some((t) => names.includes(t));
  return {
    key,
    mod: has("mod"),
    meta: has("meta", "cmd", "command"),
    ctrl: has("ctrl", "control"),
    alt: has("alt", "option"),
    shift: has("shift"),
  };
}

function matchesShortcut(e: KeyboardEvent, s: ParsedShortcut): boolean {
  // `code` as well, so Alt+O on a Mac (which types "ø") and Shift+1 (which types "!") still match;
  // but only when the key typed is not itself a letter or digit, or on Dvorak (where the KeyO key
  // types "r") ⌘⇧R would be taken for ⌘⇧O.
  const key = e.key?.toLowerCase();
  const code = e.code?.toLowerCase();
  const typedPlain = key !== undefined && /^[a-z0-9]$/.test(key);
  if (key !== s.key && (typedPlain || (code !== `key${s.key}` && code !== `digit${s.key}`))) return false;
  const modifiers = s.mod ? e.metaKey || e.ctrlKey : e.metaKey === s.meta && e.ctrlKey === s.ctrl;
  return modifiers && e.altKey === s.alt && e.shiftKey === s.shift;
}

/** `aria-keyshortcuts` for a shortcut: `mod` lists both Control and Meta. */
function ariaShortcut(s: ParsedShortcut): string {
  const key = s.key.length === 1 ? s.key.toUpperCase() : s.key[0]!.toUpperCase() + s.key.slice(1);
  const rest = [s.alt && "Alt", s.shift && "Shift", key].filter(Boolean).join("+");
  if (s.mod) return `Control+${rest} Meta+${rest}`;
  return [s.ctrl && "Control", s.meta && "Meta", rest].filter(Boolean).join("+");
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Whether the switcher is on screen, so only the visible one of several (sidebar, rail, phone bar)
 * answers a shortcut. `checkVisibility` misses a closed drawer that is moved off screen, so a copy
 * inside an `inert` or `aria-hidden` ancestor (AppShell's closed mobile drawer) never counts,
 * unless its own menu is open: an open Radix menu is modal and marks the rest of the page
 * `aria-hidden`, the switcher's own root included.
 */
function onScreen(el: HTMLElement | null, open: boolean): boolean {
  if (!el) return false;
  if (el.closest(open ? "[inert]" : "[inert],[aria-hidden='true']")) return false;
  return typeof el.checkVisibility === "function" ? el.checkVisibility() : true;
}

// The bundler's NODE_ENV, typed here so the package needs no Node types.
declare const process: { env?: { NODE_ENV?: string } } | undefined;

function isDevelopment(): boolean {
  return typeof process !== "undefined" && process.env?.NODE_ENV !== "production";
}

function useIsMac(): boolean {
  const [mac, setMac] = useState(false);
  useEffect(() => {
    if (typeof navigator !== "undefined") setMac(/mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent));
  }, []);
  return mac;
}

const NO_WORKSPACES: readonly Workspace[] = [];

const ITEM_CLASS =
  "group/workspace-item relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground";

/**
 * The workspace switcher. Put it in AppShell's `headerSlot`, and the `rail` and `bar` variants in
 * `collapsedHeaderSlot` and `mobileHeaderSlot`.
 *
 * @stability Beta
 */
export function WorkspaceSwitcher<W extends Workspace = Workspace>({
  variant = "sidebar",
  workspaces: workspacesProp,
  current: currentProp,
  hrefFor: hrefForProp,
  linkComponent: Link = DefaultLink,
  onNavigate,
  onSelect,
  order = WORKSPACE_KIND_ORDER,
  kindLabels,
  kindIcons,
  renderImage,
  renderItem,
  renderBadge,
  badgeLabel = defaultBadgeLabel,
  search = false,
  searchPlaceholder = "Find a workspace",
  emptyText = "No workspaces found",
  shortcuts,
  actions,
  footer,
  slots,
  slotProps,
  classNames,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  placeholder = "Choose a workspace",
  label = "Switch workspace",
  className,
}: WorkspaceSwitcherProps<W>) {
  const scope = useWorkspace<W>();
  const workspaces = workspacesProp ?? scope?.workspaces ?? (NO_WORKSPACES as readonly W[]);
  const current = currentProp ?? scope?.current;
  const scopeHrefFor = scope?.hrefFor;
  const currentPath = current?.path;
  // Stable across renders, so the shortcut listener isn't re-added on each one.
  const hrefFor = useMemo(
    () => hrefForProp ?? scopeHrefFor ?? ((to: W) => workspaceHref(workspaces, to, currentPath)),
    [hrefForProp, scopeHrefFor, workspaces, currentPath],
  );
  const labels = { ...DEFAULT_WORKSPACE_KIND_LABELS, ...kindLabels };
  const icons: Partial<Record<WorkspaceKind, LucideIcon>> = { ...DEFAULT_WORKSPACE_KIND_ICONS, ...kindIcons };
  const name = current?.label ?? placeholder;
  const isMac = useIsMac();
  const listId = useId();

  const [openState, setOpenState] = useState(defaultOpen);
  const open = openProp ?? openState;
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const setOpen = useCallback(
    (next: boolean) => {
      if (openProp === undefined) setOpenState(next);
      onOpenChange?.(next);
    },
    [openProp, onOpenChange],
  );
  // However it closes (the viewer, or a parent controlling `open`), the next opening starts clean.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  // "auto" never moves a footer of menu items into the search popover, where they would throw.
  const footerFitsSearch = footer === undefined || footer === null || typeof footer === "function";
  const autoSearch = search === "auto" && workspaces.length > WORKSPACE_SWITCHER_SEARCH_THRESHOLD;
  const showSearch = search === true || (autoSearch && footerFitsSearch);
  const footerFor = (mode: "menu" | "search") => (typeof footer === "function" ? footer(mode) : footer);
  const autoBlocked = autoSearch && !footerFitsSearch;
  useEffect(() => {
    if (autoBlocked && isDevelopment()) {
      // genesis-allow-console: a development set-up hint (search="auto" with a menu-only footer), not an error.
      console.warn(
        'WorkspaceSwitcher: search="auto" stays a menu because footer is not a function. Pass footer as (mode) => … to render plain links in search mode.',
      );
    }
  }, [autoBlocked]);
  const ordered = useMemo(() => orderedWorkspaces(workspaces, order), [workspaces, order]);
  const groups = groupWorkspaces(showSearch ? filterWorkspaces(workspaces, query) : workspaces, order);
  const matches = groups.flatMap((g) => g.workspaces);
  const activeIndex = matches.length === 0 ? -1 : Math.min(active, matches.length - 1);
  const optionId = (i: number) => `${listId}-option-${i}`;

  const jumpMode = shortcuts?.jump === true ? "alt" : shortcuts?.jump || undefined;
  const openSpec = shortcuts?.open || undefined;
  const openShortcut = useMemo(() => (openSpec ? parseShortcut(openSpec) : undefined), [openSpec]);
  const badSpec = Boolean(openSpec) && !openShortcut;
  useEffect(() => {
    if (badSpec && isDevelopment()) {
      // genesis-allow-console: a development set-up hint (an open shortcut with no key), not an error.
      console.warn(`WorkspaceSwitcher: shortcuts.open "${openSpec}" names no key, so it does nothing.`);
    }
  }, [badSpec, openSpec]);
  const jumpHint = (index: number) =>
    jumpMode && index >= 0 && index < 9
      ? `${jumpMode === "alt" ? (isMac ? "⌥" : "Alt+") : isMac ? "⌘" : "Ctrl+"}${index + 1}`
      : undefined;
  const jumpKeys = (index: number) =>
    jumpMode && index >= 0 && index < 9 ? (jumpMode === "alt" ? `Alt+${index + 1}` : `Control+${index + 1} Meta+${index + 1}`) : undefined;

  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const contentExtra = slotProps?.content;
  const consumerContentRef = contentExtra?.ref;
  const setContentRef = useMemo(() => composeRefs<HTMLDivElement>(contentRef, consumerContentRef), [consumerContentRef]);

  const go = useCallback(
    (w: W) => {
      onSelect?.(w);
      const href = hrefFor(w);
      if (onNavigate) onNavigate(href, w);
      else if (typeof window !== "undefined") window.location.assign(href);
    },
    [hrefFor, onNavigate, onSelect],
  );

  const missingNavigate = Boolean(jumpMode) && !onNavigate;
  useEffect(() => {
    if (missingNavigate && isDevelopment()) {
      // genesis-allow-console: a development set-up hint (jump without onNavigate), not an error.
      console.warn(
        "WorkspaceSwitcher: shortcuts.jump is on without onNavigate, so a jump reloads the page. Pass your router's navigate as onNavigate.",
      );
    }
  }, [missingNavigate]);

  // The listener reads the latest props through a ref, so it is added once rather than on every
  // render an app passes new inline callbacks.
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keyHandler.current = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.isComposing) return;
      if (!onScreen(rootRef.current, open)) return;
      if (openShortcut && matchesShortcut(e, openShortcut)) {
        const plain = !openShortcut.mod && !openShortcut.meta && !openShortcut.ctrl && !openShortcut.alt;
        if (plain && isTyping(e.target)) return;
        e.preventDefault();
        setOpen(!open);
        return;
      }
      if (!jumpMode || e.shiftKey) return;
      const held = jumpMode === "alt" ? e.altKey && !e.metaKey && !e.ctrlKey : (e.metaKey || e.ctrlKey) && !e.altKey;
      if (!held) return;
      // Option+digit types a character on a Mac (# [ ] | { }), so the Alt jump never fires in a text field.
      if (jumpMode === "alt" && isTyping(e.target)) return;
      const digit = /^Digit([1-9])$/.exec(e.code ?? "")?.[1] ?? (/^[1-9]$/.test(e.key) ? e.key : undefined);
      const target = digit ? ordered[Number(digit) - 1] : undefined;
      if (!target) return;
      e.preventDefault();
      if (open) setOpen(false);
      if (target.id !== current?.id) go(target);
    };
  });
  const listening = Boolean(openShortcut || jumpMode);
  useEffect(() => {
    if (!listening || typeof window === "undefined") return;
    const onKeyDown = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [listening]);

  // Keep the highlighted option in view as the arrows move it.
  useEffect(() => {
    if (!open || !showSearch || activeIndex < 0) return;
    const el = typeof document !== "undefined" ? document.getElementById(optionId(activeIndex)) : null;
    el?.scrollIntoView?.({ block: "nearest" });
    // optionId is derived from listId, which is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, showSearch, activeIndex]);

  const imageFor = (w: W, size: "sm" | "md") => {
    if (renderImage) return renderImage(w, size);
    const extra = slotProps?.image;
    return renderSlot(
      DefaultWorkspaceImage<W>,
      slots?.image,
      { workspace: w, size, icon: icons[w.kind], style: workspaceThemeStyle(w) },
      { ...extra, className: cn(classNames?.image, extra?.className) },
    );
  };

  const badgeFor = (w: W) => {
    if (renderBadge) return renderBadge(w);
    if (!hasBadge(w.badge)) return null;
    const extra = slotProps?.badge;
    return renderSlot(
      DefaultWorkspaceBadge<W>,
      slots?.badge,
      { workspace: w, value: w.badge, label: badgeLabel(w, w.badge) },
      { ...extra, className: cn(classNames?.badge, extra?.className) },
    );
  };

  const itemContent = (w: W, isCurrent: boolean) => {
    if (renderItem) return renderItem(w, { current: isCurrent });
    const index = ordered.indexOf(w);
    return renderSlot(
      DefaultWorkspaceItem<W>,
      slots?.item,
      { workspace: w, current: isCurrent, index, image: imageFor(w, "sm"), badge: badgeFor(w), shortcut: jumpHint(index), classNames },
      slotProps?.item,
    );
  };

  const onSearchKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    // An IME's Enter commits the composition; it never picks a workspace.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (matches.length === 0) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((activeIndex + step + matches.length) % matches.length);
      return;
    }
    if (e.key === "Enter") {
      // Only a workspace: with no match, Enter does nothing (never a footer action).
      if (activeIndex < 0) return;
      e.preventDefault();
      contentRef.current?.querySelector<HTMLElement>(`[id="${optionId(activeIndex)}"]`)?.click();
    }
  };

  const triggerExtra = slotProps?.trigger;
  const triggerProps = {
    type: "button" as const,
    variant: "ghost" as const,
    "aria-label": `${label}: ${name}`,
    "aria-keyshortcuts": openShortcut ? ariaShortcut(openShortcut) : undefined,
    ...part("trigger"),
    "data-variant": variant,
    "data-kind": current?.kind,
    ...triggerExtra,
  };
  const triggerClass = (base: string) => cn(base, classNames?.trigger, triggerExtra?.className);
  const indicator = (
    <ChevronsUpDown {...part("indicator")} className={cn("size-4 shrink-0 text-muted-foreground", classNames?.indicator)} aria-hidden />
  );
  const nameNode = (base: string) => (
    <span {...part("name")} className={cn(base, classNames?.name)}>
      {name}
    </span>
  );

  const trigger =
    variant === "rail" ? (
      <Button title={name} {...triggerProps} className={triggerClass("mx-auto size-10 p-0 hover:bg-sidebar-accent")}>
        {current ? imageFor(current, "md") : indicator}
      </Button>
    ) : variant === "bar" ? (
      <Button {...triggerProps} className={triggerClass("h-auto min-w-0 justify-start gap-2 px-1 py-1 text-left")}>
        {current ? imageFor(current, "sm") : null}
        {nameNode("truncate font-semibold")}
        {indicator}
      </Button>
    ) : (
      <Button {...triggerProps} className={triggerClass("h-auto w-full min-w-0 justify-start gap-2 p-2 text-left hover:bg-sidebar-accent")}>
        {current ? imageFor(current, "md") : null}
        <span className="flex min-w-0 flex-1 flex-col">
          {nameNode("truncate text-sm font-semibold")}
          {current?.description ? (
            <span {...part("description")} className={cn("truncate text-xs text-muted-foreground", classNames?.description)}>
              {current.description}
            </span>
          ) : null}
        </span>
        {indicator}
      </Button>
    );

  const contentProps = {
    align: "start" as const,
    side: variant === "rail" ? ("right" as const) : ("bottom" as const),
    ...part("content"),
    "data-variant": variant,
    ...contentExtra,
    ref: setContentRef,
    className: cn("w-64 max-w-[calc(100vw-2rem)]", classNames?.content, contentExtra?.className),
  };

  const actionContent = (action: WorkspaceSwitcherAction) => {
    const Icon = action.icon;
    return (
      <>
        {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" /> : null}
        <span className="min-w-0 flex-1 truncate text-left">{action.label}</span>
        {action.shortcut ? <DropdownMenuShortcut aria-hidden>{action.shortcut}</DropdownMenuShortcut> : null}
      </>
    );
  };

  const root = (children: ReactNode) => (
    <div
      ref={rootRef}
      {...part("root")}
      data-variant={variant}
      data-state={open ? "open" : "closed"}
      data-kind={current?.kind}
      className={cn(variant === "sidebar" && "p-2", classNames?.root, className)}
      data-testid="workspace-switcher"
    >
      {children}
    </div>
  );

  if (showSearch) {
    // A combobox: a text box can't live inside role="menu", so the list is a listbox it controls.
    // Not genesis-ui's Command (cmdk), deliberately (G5 exception): the public `search` and `item`
    // slots hand a replacement plain props (the value, onKeyDown, the combobox's ARIA, the
    // highlight), which cmdk keeps inside its own store; matching is core's filterWorkspaces, which
    // the phone shares, not cmdk's scorer; and Enter follows the row's link (the app's
    // LinkComponent) rather than calling onSelect. So the keys and ARIA are written here.
    const searchExtra = slotProps?.search;
    const emptyExtra = slotProps?.empty;
    const hasActions = Boolean(actions?.length);
    const searchFooter = footerFor("search");
    return root(
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          {...contentProps}
          className={cn("p-1", contentProps.className)}
          data-search=""
          aria-label={label}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            searchRef.current?.focus();
          }}
          // Escape empties a search box that has text first, as cmdk and Radix Select do; then closes.
          onEscapeKeyDown={(e) => {
            if (!query) return;
            e.preventDefault();
            setQuery("");
            setActive(0);
          }}
        >
          {renderSlot(
            DefaultWorkspaceSearch,
            slots?.search,
            {
              value: query,
              onValueChange: (v: string) => {
                setQuery(v);
                setActive(0);
              },
              onKeyDown: onSearchKeyDown,
              placeholder: searchPlaceholder,
              inputRef: searchRef,
              comboboxProps: {
                role: "combobox",
                "aria-expanded": matches.length > 0,
                "aria-controls": matches.length > 0 ? listId : undefined,
                "aria-activedescendant": activeIndex >= 0 ? optionId(activeIndex) : undefined,
                "aria-autocomplete": "list",
              },
            },
            { ...searchExtra, className: cn(classNames?.search, searchExtra?.className) },
          )}
          {matches.length === 0 ? (
            renderSlot(
              DefaultWorkspaceEmpty,
              slots?.empty,
              { query, children: emptyText },
              { ...emptyExtra, className: cn(classNames?.empty, emptyExtra?.className) },
            )
          ) : (
            <div
              {...part("list")}
              id={listId}
              role="listbox"
              aria-label={label}
              className={cn("max-h-[min(20rem,var(--radix-popover-content-available-height))] overflow-y-auto", classNames?.list)}
            >
              {groups.map((group, i) => {
                const heading = labels[group.kind];
                const headingId = `${listId}-group-${group.kind}`;
                return (
                  <div
                    key={group.kind}
                    {...part("group")}
                    role="group"
                    aria-labelledby={heading ? headingId : undefined}
                    data-kind={group.kind}
                    className={classNames?.group}
                  >
                    {i > 0 ? <div {...part("separator")} aria-hidden className={cn("-mx-1 my-1 h-px bg-muted", classNames?.separator)} /> : null}
                    {heading ? (
                      <div
                        {...part("group-label")}
                        id={headingId}
                        className={cn("px-2 py-1.5 text-xs font-normal text-muted-foreground", classNames?.["group-label"])}
                      >
                        {heading}
                      </div>
                    ) : null}
                    {group.workspaces.map((w) => {
                      const isCurrent = w.id === current?.id;
                      const position = matches.indexOf(w);
                      const highlighted = position === activeIndex;
                      return (
                        <SlotPrimitive.Root
                          key={w.id}
                          {...part("item")}
                          id={optionId(position)}
                          role="option"
                          aria-selected={highlighted}
                          aria-keyshortcuts={jumpKeys(ordered.indexOf(w))}
                          tabIndex={-1}
                          data-kind={w.kind}
                          data-current={flag(isCurrent)}
                          data-highlighted={flag(highlighted)}
                          className={cn(ITEM_CLASS, classNames?.item)}
                          style={workspaceThemeStyle(w)}
                          onMouseMove={() => {
                            if (!highlighted) setActive(position);
                          }}
                          onClick={() => {
                            onSelect?.(w);
                            setOpen(false);
                          }}
                        >
                          {/* Not redundant: aria-selected follows the arrow keys' highlight, aria-current marks where the viewer is. */}
                          <Link
                            href={hrefFor(w)}
                            className="flex w-full items-center gap-2"
                            {...(isCurrent ? { "aria-current": "page" as const } : {})}
                            testID={`workspace-switcher-item-${w.id}`}
                          >
                            {itemContent(w, isCurrent)}
                          </Link>
                        </SlotPrimitive.Root>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
          {hasActions || searchFooter ? (
            <>
              <div {...part("separator")} aria-hidden className={cn("-mx-1 my-1 h-px bg-muted", classNames?.separator)} />
              <div {...part("footer")} className={cn("flex flex-col", classNames?.footer)}>
                {actions?.map((action) => {
                  const common = {
                    ...part("action"),
                    "data-action": action.id,
                    variant: "ghost" as const,
                    className: cn("h-auto w-full justify-start gap-2 px-2 py-1.5 text-left font-normal", classNames?.action),
                  };
                  return action.href && !action.disabled ? (
                    <Button key={action.id} asChild {...common} onClick={() => setOpen(false)}>
                      <Link href={action.href} testID={`workspace-switcher-action-${action.id}`}>
                        {actionContent(action)}
                      </Link>
                    </Button>
                  ) : (
                    <Button
                      key={action.id}
                      type="button"
                      {...common}
                      disabled={action.disabled}
                      data-disabled={flag(Boolean(action.disabled))}
                      data-testid={`workspace-switcher-action-${action.id}`}
                      onClick={() => {
                        action.onSelect?.();
                        setOpen(false);
                      }}
                    >
                      {actionContent(action)}
                    </Button>
                  );
                })}
                {searchFooter}
              </div>
            </>
          ) : null}
        </PopoverContent>
      </Popover>,
    );
  }

  const separator = () => <DropdownMenuSeparator {...part("separator")} className={classNames?.separator} />;
  const menuFooter = footerFor("menu");

  return root(
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent {...contentProps}>
        {groups.map((group, i) => {
          const heading = labels[group.kind];
          return (
            <DropdownMenuGroup key={group.kind} {...part("group")} data-kind={group.kind} className={classNames?.group}>
              {i > 0 ? separator() : null}
              {heading ? (
                <DropdownMenuLabel
                  {...part("group-label")}
                  className={cn("text-xs font-normal text-muted-foreground", classNames?.["group-label"])}
                >
                  {heading}
                </DropdownMenuLabel>
              ) : null}
              {group.workspaces.map((w) => {
                const isCurrent = w.id === current?.id;
                return (
                  <DropdownMenuItem
                    key={w.id}
                    asChild
                    {...part("item")}
                    aria-keyshortcuts={jumpKeys(ordered.indexOf(w))}
                    data-kind={w.kind}
                    data-current={flag(isCurrent)}
                    className={cn("group/workspace-item", classNames?.item)}
                    style={workspaceThemeStyle(w)}
                    onSelect={() => onSelect?.(w)}
                  >
                    <Link
                      href={hrefFor(w)}
                      className="flex w-full items-center gap-2"
                      {...(isCurrent ? { "aria-current": "page" as const } : {})}
                      testID={`workspace-switcher-item-${w.id}`}
                    >
                      {itemContent(w, isCurrent)}
                    </Link>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
          );
        })}
        {actions?.length ? (
          <>
            {separator()}
            <DropdownMenuGroup {...part("footer")} className={classNames?.footer}>
              {actions.map((action) => {
                const common = {
                  ...part("action"),
                  "data-action": action.id,
                  disabled: action.disabled,
                  className: cn("gap-2", classNames?.action),
                  onSelect: action.onSelect,
                };
                return action.href && !action.disabled ? (
                  <DropdownMenuItem key={action.id} asChild {...common}>
                    <Link href={action.href} className="flex w-full items-center gap-2" testID={`workspace-switcher-action-${action.id}`}>
                      {actionContent(action)}
                    </Link>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem key={action.id} {...common} data-testid={`workspace-switcher-action-${action.id}`}>
                    {actionContent(action)}
                  </DropdownMenuItem>
                );
              })}
              {menuFooter}
            </DropdownMenuGroup>
          </>
        ) : menuFooter ? (
          // Without `actions`, the footer is exactly where it always was: after a separator, unwrapped.
          <>
            <DropdownMenuSeparator />
            {menuFooter}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>,
  );
}
