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
 * - **Props**: group headings (`kindLabels`), pictures (`kindIcons`), a search box (`search`,
 *   on by itself past 7 workspaces), keyboard shortcuts (`shortcuts`), the menu's last items
 *   (`actions`, `footer`).
 * - **Styling**: every element carries `data-scope="workspace-switcher"` and a `data-part`, plus
 *   state attributes (`data-state`, `data-current`, `data-kind`, `data-variant`), so a stylesheet
 *   or Tailwind's `data-*` variants can reach any part. `classNames` adds classes per part. The
 *   menu's width and the pictures' corner radius are CSS variables
 *   (`--workspace-switcher-menu-width`, `--workspace-switcher-image-radius`); colors are the
 *   design system's tokens, and a workspace's `theme.accent` re-points `--primary` on its own
 *   picture and row (`workspaceThemeStyle`).
 * - **Slots** (genesis-core's `slots`/`slotProps` contract): replace or drop a part (`image`,
 *   `item`, `badge`, `empty`, `search`), or pass a part more props (`slotProps`, which also
 *   reaches the `trigger` button and the menu `content`). `renderImage`, `renderItem` and
 *   `renderBadge` are the one-function shorthands.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ComponentType,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
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

/** Past this many workspaces the menu opens with a search box (unless `search` says otherwise). */
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
   * `meta`/`cmd`, `ctrl`, `alt`/`option` and `shift`, joined by `+`, then the key. A key with no
   * modifier is ignored while the viewer is typing.
   */
  open?: string | false;
  /**
   * `true` or `"mod"`: ⌘1 to ⌘9 (Ctrl elsewhere) go straight to the first nine workspaces, in the
   * menu's order, and the menu shows each one's number. Browsers keep some of these for their
   * tabs, so `"alt"` uses Alt+1 to Alt+9 instead.
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

/** What `slots.badge` receives. */
export interface WorkspaceSwitcherBadgeProps<W extends Workspace = Workspace> {
  workspace: W;
  value: string | number;
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
  /** Put it on your input: it keeps the menu's typeahead off the box and moves into the list on ↓. */
  onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  placeholder: string;
  /** Put it on your input: the menu focuses it on opening. */
  inputRef: Ref<HTMLInputElement>;
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
  content?: Partial<ComponentProps<typeof DropdownMenuContent>>;
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
  /** The router's link (see AppShell's `linkComponent`). */
  linkComponent?: LinkComponent;
  /**
   * How a keyboard jump (`shortcuts.jump`) goes to a workspace: pass the router's navigate.
   * Default: a full page load of the link.
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
  /** Replaces a workspace's badge (default: its `badge`, as a pill). Shorthand for `slots.badge`. */
  renderBadge?: (workspace: W) => ReactNode;
  /**
   * A search box at the top of the menu. Default `"auto"`: shown past
   * {@link WORKSPACE_SWITCHER_SEARCH_THRESHOLD} workspaces.
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
  /** The menu's last items, after `actions`: any menu items of your own. */
  footer?: ReactNode;
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

/** The default picture: the workspace's image, else its kind's icon, else its initials. */
function DefaultWorkspaceImage<W extends Workspace>({ workspace, size, icon: Icon, className, style }: WorkspaceSwitcherImageProps<W>) {
  const ShownIcon = workspace.image ? undefined : Icon;
  return (
    <Avatar
      {...part("image")}
      data-kind={workspace.kind}
      data-size={size}
      className={cn(
        "shrink-0 rounded-[var(--workspace-switcher-image-radius,calc(var(--radius)-2px))]",
        size === "sm" ? "size-6" : "size-8",
        className,
      )}
      style={style}
      aria-hidden
    >
      {workspace.image ? <AvatarImage src={workspace.image} alt="" /> : null}
      <AvatarFallback
        className={cn(
          "rounded-[inherit] font-semibold",
          size === "sm" ? "text-[10px]" : "text-xs",
          workspace.kind === "tenant" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {ShownIcon ? <ShownIcon className={size === "sm" ? "size-3.5" : "size-4"} /> : workspaceInitials(workspace.label)}
      </AvatarFallback>
    </Avatar>
  );
}

function DefaultWorkspaceBadge<W extends Workspace>({ value, className }: WorkspaceSwitcherBadgeProps<W>) {
  return (
    <Badge {...part("badge")} variant="secondary" className={cn("shrink-0 px-1.5 py-0 tabular-nums", className)}>
      {value}
    </Badge>
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
          <span {...part("item-description")} className={cn("truncate text-xs text-muted-foreground", classNames?.["item-description"])}>
            {workspace.description}
          </span>
        ) : null}
      </span>
      {badge}
      {shortcut ? (
        <DropdownMenuShortcut {...part("item-shortcut")} className={cn("ml-0", classNames?.["item-shortcut"])}>
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

function DefaultWorkspaceSearch({ value, onValueChange, onKeyDown, placeholder, inputRef, className }: WorkspaceSwitcherSearchProps) {
  return (
    <div {...part("search")} className={cn("-mx-1 -mt-1 mb-1 flex items-center gap-2 border-b px-3", className)}>
      <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <input
        ref={inputRef}
        type="text"
        role="searchbox"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
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
  const key = tokens.pop();
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
  // `code` too, so Alt+O on a Mac (which types "ø") still matches.
  const key = e.key?.toLowerCase();
  if (key !== s.key && e.code?.toLowerCase() !== `key${s.key}`) return false;
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

/** Whether the switcher is on screen, so only the visible one of several answers a shortcut. */
function onScreen(el: HTMLElement | null): boolean {
  if (!el) return false;
  return typeof el.checkVisibility === "function" ? el.checkVisibility() : true;
}

function useIsMac(): boolean {
  const [mac, setMac] = useState(false);
  useEffect(() => {
    if (typeof navigator !== "undefined") setMac(/mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent));
  }, []);
  return mac;
}

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
  search = "auto",
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
  const workspaces = workspacesProp ?? scope?.workspaces ?? [];
  const current = currentProp ?? scope?.current;
  const hrefFor = hrefForProp ?? scope?.hrefFor ?? ((to: W) => workspaceHref(workspaces, to, current?.path));
  const labels = { ...DEFAULT_WORKSPACE_KIND_LABELS, ...kindLabels };
  const icons: Partial<Record<WorkspaceKind, LucideIcon>> = { ...DEFAULT_WORKSPACE_KIND_ICONS, ...kindIcons };
  const name = current?.label ?? placeholder;
  const isMac = useIsMac();

  const [openState, setOpenState] = useState(defaultOpen);
  const open = openProp ?? openState;
  const [query, setQuery] = useState("");
  const setOpen = useCallback(
    (next: boolean) => {
      if (openProp === undefined) setOpenState(next);
      if (!next) setQuery("");
      onOpenChange?.(next);
    },
    [openProp, onOpenChange],
  );

  const showSearch = search === true || (search === "auto" && workspaces.length > WORKSPACE_SWITCHER_SEARCH_THRESHOLD);
  const ordered = useMemo(() => orderedWorkspaces(workspaces, order), [workspaces, order]);
  const groups = groupWorkspaces(showSearch ? filterWorkspaces(workspaces, query) : workspaces, order);

  const jumpMode = shortcuts?.jump === true ? "mod" : shortcuts?.jump || undefined;
  const openSpec = shortcuts?.open || undefined;
  const openShortcut = useMemo(() => (openSpec ? parseShortcut(openSpec) : undefined), [openSpec]);
  const jumpHint = (index: number) =>
    jumpMode && index >= 0 && index < 9
      ? `${jumpMode === "alt" ? (isMac ? "⌥" : "Alt+") : isMac ? "⌘" : "Ctrl+"}${index + 1}`
      : undefined;

  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const go = useCallback(
    (w: W) => {
      onSelect?.(w);
      const href = hrefFor(w);
      if (onNavigate) onNavigate(href, w);
      else if (typeof window !== "undefined") window.location.assign(href);
    },
    [hrefFor, onNavigate, onSelect],
  );

  useEffect(() => {
    if (!openShortcut && !jumpMode) return;
    if (typeof window === "undefined") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return;
      if (!onScreen(rootRef.current)) return;
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
      const digit = /^Digit([1-9])$/.exec(e.code ?? "")?.[1] ?? (/^[1-9]$/.test(e.key) ? e.key : undefined);
      const target = digit ? ordered[Number(digit) - 1] : undefined;
      if (!target) return;
      e.preventDefault();
      if (open) setOpen(false);
      if (target.id !== current?.id) go(target);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openShortcut, jumpMode, ordered, current?.id, go, open, setOpen]);

  // The menu focuses itself on opening; move focus on to the search box.
  useEffect(() => {
    if (!open || !showSearch) return;
    searchRef.current?.focus();
    const frame = typeof requestAnimationFrame === "function" ? requestAnimationFrame(() => searchRef.current?.focus()) : undefined;
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [open, showSearch]);

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
      { workspace: w, value: w.badge },
      { ...extra, className: cn(classNames?.badge, extra?.className) },
    );
  };

  const onSearchKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape" || e.key === "Tab") return;
    // Keep the menu's typeahead and arrow keys off the box; ↓ moves into the list, Enter picks the first.
    e.stopPropagation();
    if (e.key !== "ArrowDown" && e.key !== "Enter") return;
    const first = contentRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([data-disabled])');
    if (!first) return;
    e.preventDefault();
    if (e.key === "Enter") first.click();
    else first.focus();
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

  const contentExtra = slotProps?.content;
  const searchExtra = slotProps?.search;
  const emptyExtra = slotProps?.empty;
  const separator = (key?: string) => <DropdownMenuSeparator key={key} {...part("separator")} className={classNames?.separator} />;

  return (
    <div
      ref={rootRef}
      {...part("root")}
      data-variant={variant}
      data-state={open ? "open" : "closed"}
      data-kind={current?.kind}
      className={cn(variant === "sidebar" && "p-2", classNames?.root, className)}
      data-testid="workspace-switcher"
    >
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent
          ref={contentRef}
          align="start"
          side={variant === "rail" ? "right" : "bottom"}
          {...part("content")}
          data-variant={variant}
          {...contentExtra}
          className={cn(
            "w-[var(--workspace-switcher-menu-width,16rem)] max-w-[calc(100vw-2rem)]",
            classNames?.content,
            contentExtra?.className,
          )}
        >
          {showSearch
            ? renderSlot(
                DefaultWorkspaceSearch,
                slots?.search,
                { value: query, onValueChange: setQuery, onKeyDown: onSearchKeyDown, placeholder: searchPlaceholder, inputRef: searchRef },
                { ...searchExtra, className: cn(classNames?.search, searchExtra?.className) },
              )
            : null}
          {showSearch && groups.length === 0
            ? renderSlot(
                DefaultWorkspaceEmpty,
                slots?.empty,
                { query, children: emptyText },
                { ...emptyExtra, className: cn(classNames?.empty, emptyExtra?.className) },
              )
            : null}
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
                  const index = ordered.indexOf(w);
                  return (
                    <DropdownMenuItem
                      key={w.id}
                      asChild
                      {...part("item")}
                      data-kind={w.kind}
                      data-current={flag(isCurrent)}
                      className={classNames?.item}
                      style={workspaceThemeStyle(w)}
                      onSelect={() => onSelect?.(w)}
                    >
                      <Link
                        href={hrefFor(w)}
                        className="flex w-full items-center gap-2"
                        {...(isCurrent ? { "aria-current": "page" as const } : {})}
                        testID={`workspace-switcher-item-${w.id}`}
                      >
                        {renderItem
                          ? renderItem(w, { current: isCurrent })
                          : renderSlot(
                              DefaultWorkspaceItem<W>,
                              slots?.item,
                              {
                                workspace: w,
                                current: isCurrent,
                                index,
                                image: imageFor(w, "sm"),
                                badge: badgeFor(w),
                                shortcut: jumpHint(index),
                                classNames,
                              },
                              slotProps?.item,
                            )}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuGroup>
            );
          })}
          {actions?.length || footer ? (
            <>
              {groups.length > 0 || showSearch ? separator() : null}
              <DropdownMenuGroup {...part("footer")} className={classNames?.footer}>
                {actions?.map((action) => {
                  const Icon = action.icon;
                  const inner = (
                    <>
                      {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" /> : null}
                      <span className="min-w-0 flex-1 truncate">{action.label}</span>
                      {action.shortcut ? <DropdownMenuShortcut>{action.shortcut}</DropdownMenuShortcut> : null}
                    </>
                  );
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
                        {inner}
                      </Link>
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem key={action.id} {...common} data-testid={`workspace-switcher-action-${action.id}`}>
                      {inner}
                    </DropdownMenuItem>
                  );
                })}
                {footer}
              </DropdownMenuGroup>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
