/**
 * @feat:chat-dock
 * The chat dock: conversations that stay open while you move around the app. On a wide screen up
 * to three windows sit bottom-right (fewer when the screen is narrower than three fit; the rest
 * wait behind a "+N" menu), each with its own thread and composer, minimized to a bar or closed; a
 * fourth replaces the one used longest ago. On a narrow screen the open ones share one side sheet
 * with a switcher, and a bubble (with the unread count) brings it back. "Expand" opens the zone's
 * own Messages page through `onExpand`.
 *
 * A minimized window and a sheet tab out of view keep their thread mounted but hidden, with
 * read-marking paused: what you were typing, a reply and attachments wait for you, and nothing is
 * marked read while it's out of sight.
 *
 * A conversation opens with `useChatDock().open(conversationId)`. Anything else that should live
 * in the dock (a help desk messenger) opens with `openPanel({ id, title, render })`: the dock
 * draws the window, the panel draws what's in it.
 *
 * Mount `ChatDockProvider` under `ChatProvider`, around the app, and `<ChatDock />` once: in
 * AppShell's `dock` slot, which keeps it clear of the phone's bottom bar.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { ChevronDown, ChevronUp, Maximize2, MessageCircle, X } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  UserAvatar,
  cn,
} from "@marktiderman/genesis-ui";
import { useIsMobile } from "@marktiderman/genesis-ui/hooks";
import { createLocalStorageAdapter } from "@marktiderman/genesis-core/storage";
import type { ChatInboxItem } from "../core/types";
import { useChat, useInbox } from "../react/index";
import { inboxTitle } from "./inbox";
import type { ResolveUser } from "./format";
import { ChatThread, type ChatThreadHeaderProps, type ChatThreadProps } from "./thread";

// ---------------------------------------------------------------------------------------------
// State

/** A conversation in the dock. */
export interface ChatDockConversation {
  type: "conversation";
  /** The dock's id for it: the conversation's id. */
  id: string;
  conversationId: string;
  /** The window's title; worked out from the conversation by default. */
  title?: string;
  minimized: boolean;
  /** Brought back from storage (checked against the server once, then dropped if it's gone). */
  restored?: boolean;
}

/** Anything else that lives in the dock (a help desk messenger): the dock draws the window, `render` its body. */
export interface ChatDockPanel {
  type: "panel";
  /** Opening the same id again brings that window back rather than adding a second. */
  id: string;
  title: string;
  /** Its body, filling the window under the dock's title bar. */
  render: () => ReactNode;
  /** In place of the avatar in the title bar. */
  icon?: ReactNode;
  /** Unread count on the bar and the bubble. */
  unread?: number;
  /** Its own expand (its full page); wins over the dock's `onExpand`. */
  onExpand?: () => void;
  minimized: boolean;
}

export type ChatDockItem = ChatDockConversation | ChatDockPanel;

export interface ChatDockState {
  /** In the order they show: the newest first (rightmost on a wide screen). */
  items: ChatDockItem[];
  /** The one the narrow screen's sheet shows. */
  activeId: string | null;
  /** Whether the narrow screen's sheet is open. */
  sheetOpen: boolean;
  /** When each was last used (opened, restored, switched to), for replacing the one used longest ago. */
  used: Record<string, number>;
  /** The one just opened or restored, whose composer takes focus. */
  focusId: string | null;
  /** Bumps on every use. */
  clock: number;
}

/** What a panel can change while it's docked, without moving or opening it. */
export type ChatDockPanelPatch = Partial<Pick<ChatDockPanel, "title" | "unread" | "icon" | "render" | "onExpand">>;

export type ChatDockAction =
  | { type: "open"; item: ChatDockItem }
  | { type: "close"; id: string }
  | { type: "minimize"; id: string; minimized: boolean }
  | { type: "activate"; id: string }
  | { type: "front"; id: string }
  | { type: "sheet"; open: boolean }
  | { type: "update"; id: string; patch: ChatDockPanelPatch }
  | { type: "hydrate"; items: ChatDockItem[] }
  | { type: "closeAll" };

export const emptyChatDock: ChatDockState = { items: [], activeId: null, sheetOpen: false, used: {}, focusId: null, clock: 0 };

const sameItem = (a: ChatDockItem, b: ChatDockItem) =>
  (Object.keys({ ...a, ...b }) as (keyof ChatDockItem)[]).every((k) => k === "minimized" || a[k] === b[k]);

function touch(state: ChatDockState, id: string): Pick<ChatDockState, "used" | "clock"> {
  const clock = state.clock + 1;
  return { clock, used: { ...state.used, [id]: clock } };
}

function without<T>(record: Record<string, T>, id: string): Record<string, T> {
  const { [id]: _gone, ...rest } = record;
  return rest;
}

/**
 * The dock's state machine, pure. Opening puts the item first, open, active and focused; past
 * `max`, the one used longest ago goes (restoring or switching to one counts as using it). Actions
 * that change nothing return the same state, so an effect that calls them every render settles.
 */
export function chatDockReducer(state: ChatDockState, action: ChatDockAction, max = 3): ChatDockState {
  const cap = Math.max(1, max);
  switch (action.type) {
    case "open": {
      const at = state.items.findIndex((i) => i.id === action.item.id);
      const current = state.items[at];
      if (at === 0 && current && !current.minimized && sameItem(current, action.item) && state.activeId === current.id && state.sheetOpen && state.focusId === current.id) {
        return state;
      }
      // First, so it's in view even when fewer fit than are open.
      const item = { ...action.item, minimized: false };
      let items = [item, ...state.items.filter((i) => i.id !== item.id)];
      let used = { ...touch(state, item.id).used };
      while (items.length > cap) {
        const oldest = items.filter((i) => i.id !== item.id).reduce((a, b) => ((used[a.id] ?? 0) <= (used[b.id] ?? 0) ? a : b));
        items = items.filter((i) => i.id !== oldest.id);
        used = without(used, oldest.id);
      }
      return { items, activeId: item.id, sheetOpen: true, used, focusId: item.id, clock: state.clock + 1 };
    }
    case "close": {
      const items = state.items.filter((i) => i.id !== action.id);
      if (items.length === state.items.length) return state;
      const activeId = state.activeId === action.id ? (items[0]?.id ?? null) : state.activeId;
      return {
        ...state,
        items,
        activeId,
        sheetOpen: state.sheetOpen && items.length > 0,
        used: without(state.used, action.id),
        focusId: state.focusId === action.id ? null : state.focusId,
      };
    }
    case "minimize": {
      if (!state.items.some((i) => i.id === action.id && i.minimized !== action.minimized)) return state;
      const items = state.items.map((i) => (i.id === action.id ? { ...i, minimized: action.minimized } : i));
      // Restoring is using it: it focuses, and it's no longer the one to replace.
      if (!action.minimized) return { ...state, items, ...touch(state, action.id), focusId: action.id };
      return { ...state, items, focusId: state.focusId === action.id ? null : state.focusId };
    }
    case "activate": {
      if (!state.items.some((i) => i.id === action.id)) return state;
      if (state.activeId === action.id && state.focusId === action.id) return state;
      return { ...state, activeId: action.id, ...touch(state, action.id), focusId: action.id };
    }
    case "front": {
      const at = state.items.findIndex((i) => i.id === action.id);
      if (at === -1) return state;
      const item = { ...state.items[at]!, minimized: false };
      const items = [item, ...state.items.filter((_, n) => n !== at)];
      return { ...state, items, activeId: item.id, ...touch(state, item.id), focusId: item.id };
    }
    case "sheet": {
      const sheetOpen = action.open && state.items.length > 0;
      return sheetOpen === state.sheetOpen ? state : { ...state, sheetOpen };
    }
    case "update": {
      const at = state.items.findIndex((i) => i.id === action.id && i.type === "panel");
      if (at === -1) return state;
      const panel = state.items[at] as ChatDockPanel;
      const changed = (Object.keys(action.patch) as (keyof ChatDockPanelPatch)[]).some((k) => panel[k] !== action.patch[k]);
      if (!changed) return state;
      const items = state.items.slice();
      items[at] = { ...panel, ...action.patch };
      return { ...state, items };
    }
    case "hydrate": {
      // Only into an empty dock: anything opened before storage was read wins.
      if (state.items.length > 0 || action.items.length === 0) return state;
      const items = action.items.slice(0, cap);
      const used: Record<string, number> = {};
      items.forEach((i, n) => (used[i.id] = items.length - n));
      return { ...state, items, activeId: items[0]?.id ?? null, used, clock: Math.max(state.clock, items.length) };
    }
    case "closeAll":
      return state.items.length === 0 ? state : emptyChatDock;
  }
}

// ---------------------------------------------------------------------------------------------
// Storage

interface StoredItem {
  conversationId: string;
  title?: string;
}

const storage = createLocalStorageAdapter();
const storageName = (key: string, userId: string) => `${key}:${userId}`;

function readStored(key: string, userId: string, max: number): ChatDockItem[] {
  try {
    const raw = storage.getItem(storageName(key, userId));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s): s is StoredItem => !!s && typeof (s as StoredItem).conversationId === "string" && (s as StoredItem).conversationId !== "")
      .slice(0, Math.max(1, max))
      .map((s) => ({
        type: "conversation" as const,
        id: s.conversationId,
        conversationId: s.conversationId,
        ...(typeof s.title === "string" ? { title: s.title } : {}),
        // Brought back as bars: nothing opens over the page on load.
        minimized: true,
        restored: true,
      }));
  } catch {
    return [];
  }
}

function writeStored(key: string, userId: string, items: ChatDockItem[]) {
  const stored: StoredItem[] = items
    .filter((i): i is ChatDockConversation => i.type === "conversation")
    .map((i) => ({ conversationId: i.conversationId, ...(i.title ? { title: i.title } : {}) }));
  if (stored.length === 0) storage.removeItem(storageName(key, userId));
  else storage.setItem(storageName(key, userId), JSON.stringify(stored));
}

/** Forgets what the dock kept for this person under `storageKey` (call it on sign-out on a shared browser). */
export function forgetChatDock(storageKey: string, userId: string): void {
  storage.removeItem(storageName(storageKey, userId));
}

const noSubscribe = () => () => {};
/** False while hydrating server HTML (it must match), true once the client renders on its own. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
}

// ---------------------------------------------------------------------------------------------
// Provider

export interface OpenConversationOptions {
  /** The window's title; worked out from the conversation by default. */
  title?: string;
  /** Open it as a bar. */
  minimized?: boolean;
}

export type OpenPanelInput = Omit<ChatDockPanel, "type" | "minimized"> & { minimized?: boolean };

export interface ChatDockApi {
  items: ChatDockItem[];
  activeId: string | null;
  /** The one whose composer takes focus (just opened or restored). */
  focusId: string | null;
  /** Opens a conversation in the dock, or brings it back if it's there. */
  open: (conversationId: string, opts?: OpenConversationOptions) => void;
  /** Opens a panel of your own in the dock (the help desk messenger), or brings it back. */
  openPanel: (panel: OpenPanelInput) => void;
  /**
   * Changes a docked panel in place (its unread count as it changes, its title) without moving,
   * opening or restoring it. Nothing happens if that panel isn't docked, or nothing changed.
   */
  updatePanel: (id: string, patch: ChatDockPanelPatch) => void;
  close: (id: string) => void;
  closeAll: () => void;
  minimize: (id: string) => void;
  restore: (id: string) => void;
  /** Shows this one in the narrow screen's sheet, without reordering. */
  activate: (id: string) => void;
  /** Moves one waiting behind "+N" into view, first. */
  bringToFront: (id: string) => void;
  /** Expands an item to its page (its own `onExpand`, else the dock's), and takes it out of the dock. */
  expand: (id: string) => void;
  /** Whether expanding means anything (a panel's own `onExpand` or the dock's). */
  canExpand: (item: ChatDockItem) => boolean;
  /** The narrow screen's sheet. */
  sheetOpen: boolean;
  setSheetOpen: (open: boolean) => void;
}

export interface ChatDockProviderProps {
  /** How many windows at once. Default 3. */
  max?: number;
  /** "Expand": open the item on the zone's Messages page (route to it). Without it there's no expand button for conversations. */
  onExpand?: (item: ChatDockItem) => void;
  /**
   * Keep the open conversations (not panels: they hold functions) across reloads, in this
   * browser's localStorage under this key and the signed-in person's id, so the next person on a
   * shared browser never sees them (`forgetChatDock` clears it on sign-out). They come back as
   * bars, after hydration, and any that no longer exist are dropped. Off by default.
   */
  storageKey?: string;
  children: ReactNode;
}

const DockContext = createContext<ChatDockApi | null>(null);

export function ChatDockProvider({ max = 3, onExpand, storageKey, children }: ChatDockProviderProps) {
  const { userId, client } = useChat();
  const [state, dispatch] = useReducer((s: ChatDockState, a: ChatDockAction) => chatDockReducer(s, a, max), emptyChatDock);
  const hydrated = useHydrated();
  // Read once storage is reachable without changing the server's HTML, and only then write, so
  // the first (empty) render never wipes what was kept.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const storeKey = storageKey && userId ? `${storageKey}\u0000${userId}` : null;
  useEffect(() => {
    if (!hydrated || !storageKey || !userId || loadedFor === storeKey) return;
    dispatch({ type: "hydrate", items: readStored(storageKey, userId, max) });
    setLoadedFor(storeKey);
  }, [hydrated, storageKey, userId, storeKey, loadedFor, max]);
  useEffect(() => {
    if (!storageKey || !userId || loadedFor !== storeKey) return;
    writeStored(storageKey, userId, state.items);
  }, [storageKey, userId, storeKey, loadedFor, state.items]);

  // A conversation brought back from storage that no longer exists (or you've left) goes.
  const restoredIds = state.items.filter((i): i is ChatDockConversation => i.type === "conversation" && !!i.restored).map((i) => i.conversationId).join(",");
  useEffect(() => {
    if (!restoredIds) return;
    let live = true;
    for (const id of restoredIds.split(",")) {
      void client
        .conversation(id)
        .then((c) => {
          if (live && !c) dispatch({ type: "close", id });
        })
        .catch(() => undefined);
    }
    return () => {
      live = false;
    };
  }, [restoredIds, client]);

  const expandRef = useRef(onExpand);
  expandRef.current = onExpand;
  const itemsRef = useRef(state.items);
  itemsRef.current = state.items;

  const open = useCallback((conversationId: string, opts: OpenConversationOptions = {}) => {
    if (!conversationId) return;
    const item: ChatDockConversation = { type: "conversation", id: conversationId, conversationId, minimized: false };
    if (opts.title) item.title = opts.title;
    dispatch({ type: "open", item });
    if (opts.minimized) dispatch({ type: "minimize", id: conversationId, minimized: true });
  }, []);
  const openPanel = useCallback(({ minimized, ...panel }: OpenPanelInput) => {
    if (!panel.id) return;
    dispatch({ type: "open", item: { ...panel, type: "panel", minimized: false } });
    if (minimized) dispatch({ type: "minimize", id: panel.id, minimized: true });
  }, []);
  const updatePanel = useCallback((id: string, patch: ChatDockPanelPatch) => dispatch({ type: "update", id, patch }), []);
  const close = useCallback((id: string) => dispatch({ type: "close", id }), []);
  const closeAll = useCallback(() => dispatch({ type: "closeAll" }), []);
  const minimize = useCallback((id: string) => dispatch({ type: "minimize", id, minimized: true }), []);
  const restore = useCallback((id: string) => dispatch({ type: "minimize", id, minimized: false }), []);
  const activate = useCallback((id: string) => dispatch({ type: "activate", id }), []);
  const bringToFront = useCallback((id: string) => dispatch({ type: "front", id }), []);
  const setSheetOpen = useCallback((o: boolean) => dispatch({ type: "sheet", open: o }), []);
  const hasExpand = !!onExpand;
  const canExpand = useCallback((item: ChatDockItem) => (item.type === "panel" && !!item.onExpand) || hasExpand, [hasExpand]);
  const expand = useCallback((id: string) => {
    const item = itemsRef.current.find((i) => i.id === id);
    if (!item) return;
    const run = item.type === "panel" && item.onExpand ? item.onExpand : expandRef.current ? () => expandRef.current!(item) : null;
    if (!run) return;
    // Out of the dock first: the page it opens shows the same conversation, and two composers
    // for one conversation side by side is one too many.
    dispatch({ type: "close", id });
    run();
  }, []);

  const api = useMemo<ChatDockApi>(
    () => ({
      items: state.items,
      activeId: state.activeId,
      focusId: state.focusId,
      sheetOpen: state.sheetOpen,
      open,
      openPanel,
      updatePanel,
      close,
      closeAll,
      minimize,
      restore,
      activate,
      bringToFront,
      expand,
      canExpand,
      setSheetOpen,
    }),
    [state.items, state.activeId, state.focusId, state.sheetOpen, open, openPanel, updatePanel, close, closeAll, minimize, restore, activate, bringToFront, expand, canExpand, setSheetOpen],
  );
  return <DockContext.Provider value={api}>{children}</DockContext.Provider>;
}

/** The dock: open a conversation or a panel in it from anywhere under `ChatDockProvider`. */
export function useChatDock(): ChatDockApi {
  const api = useContext(DockContext);
  if (!api) throw new Error("useChatDock needs a ChatDockProvider above it (under ChatProvider).");
  return api;
}

/** The dock when there is one, else null: for a button that opens in the dock when the app has one, and navigates when it doesn't. */
export function useOptionalChatDock(): ChatDockApi | null {
  return useContext(DockContext);
}

// ---------------------------------------------------------------------------------------------
// Rendering

export interface ChatDockLabels {
  minimize: string;
  restore: string;
  expand: string;
  close: string;
  /** The narrow screen's bubble. */
  openDock: string;
  /** The sheet's name for screen readers. */
  sheetTitle: string;
  sheetDescription: string;
  /** "3 unread". */
  unread: (n: number) => string;
  /** The live announcement of everything unread in the dock. */
  unreadTotal: (n: number) => string;
  /** "+2": the windows that don't fit, and its menu's name. */
  more: (n: number) => string;
  moreLabel: (n: number) => string;
  /** A conversation whose title isn't known yet. */
  conversation: string;
}

export const defaultChatDockLabels: ChatDockLabels = {
  minimize: "Minimize",
  restore: "Open",
  expand: "Open in Messages",
  close: "Close",
  openDock: "Open conversations",
  sheetTitle: "Conversations",
  sheetDescription: "Your open conversations.",
  unread: (n) => `${n} unread`,
  unreadTotal: (n) => (n > 0 ? `${n} unread in your open conversations` : ""),
  more: (n) => `+${n}`,
  moreLabel: (n) => `${n} more conversation${n === 1 ? "" : "s"}`,
  conversation: "Conversation",
};

export interface ChatDockProps {
  resolveUser: ResolveUser;
  /** Passed to every docked conversation's ChatThread. */
  threadProps?: Partial<Omit<ChatThreadProps, "conversationId" | "resolveUser" | "onBack" | "title" | "markRead" | "autoFocus">>;
  labels?: Partial<ChatDockLabels>;
  /** The narrow screen's bubble when the sheet is closed. Default true. */
  bubble?: boolean;
  className?: string;
}

/** A window's width and the gap between windows, in px (22rem and 0.75rem), and the dock's side padding. */
const WINDOW_PX = 352;
const GAP_PX = 12;
const PAD_PX = 32;
/** Room for the "+N" button beside the windows. */
const MORE_PX = 56;

function subscribeWidth(cb: () => void) {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
}
/** The viewport's width (the server renders as wide). */
function useViewportWidth(): number {
  return useSyncExternalStore(
    subscribeWidth,
    () => window.innerWidth,
    () => 1440,
  );
}

/** How many of `count` windows fit side by side at `width`, leaving room for "+N" when some don't. */
export function chatDockWindowsThatFit(width: number, count: number): number {
  const fits = (room: number) => Math.max(1, Math.floor((room - PAD_PX + GAP_PX) / (WINDOW_PX + GAP_PX)));
  const all = fits(width);
  return count <= all ? count : fits(width - MORE_PX);
}

function conversationTitle(item: ChatDockConversation, inbox: Map<string, ChatInboxItem>, resolveUser: ResolveUser, labels: ChatDockLabels): string {
  if (item.title) return item.title;
  const row = inbox.get(item.conversationId);
  return row ? inboxTitle(row, resolveUser, () => labels.conversation) : labels.conversation;
}

function itemTitle(item: ChatDockItem, inbox: Map<string, ChatInboxItem>, resolveUser: ResolveUser, labels: ChatDockLabels): string {
  return item.type === "panel" ? item.title : conversationTitle(item, inbox, resolveUser, labels);
}

function itemUnread(item: ChatDockItem, inbox: Map<string, ChatInboxItem>): number {
  if (item.type === "panel") return item.unread ?? 0;
  const row = inbox.get(item.conversationId);
  return row && !row.muted ? row.unread : 0;
}

interface HeaderInfo {
  title: string;
  subtitle: string | null;
  otherUserId: string | null;
}

interface TitleBarProps {
  item: ChatDockItem;
  title: string;
  avatar: ReactNode;
  subtitle: string | null;
  unread: number;
  labels: ChatDockLabels;
  /** On the narrow screen: no minimize (the sheet closes instead). */
  inSheet: boolean;
  toggleRef?: RefObject<HTMLButtonElement | null>;
}

function DockTitleBar({ item, title, avatar, subtitle, unread, labels, inSheet, toggleRef }: TitleBarProps) {
  const dock = useChatDock();
  const toggle = () => (item.minimized ? dock.restore(item.id) : dock.minimize(item.id));
  const titleText = (
    <span className="min-w-0 flex-1 text-left">
      <span className="block truncate text-sm font-semibold leading-tight">{title}</span>
      {subtitle ? <span className="block truncate text-xs text-muted-foreground">{subtitle}</span> : null}
    </span>
  );
  return (
    <div className="flex min-h-12 shrink-0 items-center gap-1 border-b bg-background px-2 py-1.5" data-testid="genesis-chat-dock-titlebar">
      {inSheet ? (
        <div className="flex min-w-0 flex-1 items-center gap-2 px-1">
          {avatar}
          {titleText}
        </div>
      ) : (
        <button
          ref={toggleRef}
          type="button"
          onClick={toggle}
          aria-expanded={!item.minimized}
          aria-label={`${title}${unread > 0 ? `, ${labels.unread(unread)}` : ""}. ${item.minimized ? labels.restore : labels.minimize}`}
          className="flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-md px-1 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="genesis-chat-dock-toggle"
        >
          {avatar}
          {titleText}
          {unread > 0 ? (
            <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground" aria-hidden>
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
          {item.minimized ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
        </button>
      )}
      {dock.canExpand(item) ? (
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => dock.expand(item.id)} aria-label={labels.expand} title={labels.expand} data-testid="genesis-chat-dock-expand">
          <Maximize2 />
        </Button>
      ) : null}
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => dock.close(item.id)} aria-label={labels.close} title={labels.close} data-testid="genesis-chat-dock-close">
        <X />
      </Button>
    </div>
  );
}

interface ItemProps {
  item: ChatDockItem;
  inbox: Map<string, ChatInboxItem>;
  resolveUser: ResolveUser;
  threadProps: ChatDockProps["threadProps"];
  labels: ChatDockLabels;
  inSheet: boolean;
  /** Whether its body is on screen (not minimized, or the sheet's active tab with the sheet open). */
  visible: boolean;
  /** Its composer takes focus (it was just opened or restored). */
  focus: boolean;
  toggleRef?: RefObject<HTMLButtonElement | null>;
}

/**
 * One docked item: the title bar (always the same element, so focus on it survives minimizing)
 * and the body under it, kept mounted while hidden.
 */
function DockItemView({ item, inbox, resolveUser, threadProps, labels, inSheet, visible, focus, toggleRef }: ItemProps) {
  const unread = itemUnread(item, inbox);
  // What the thread worked out for its header (title, "typing…"), shown in the dock's bar.
  const [header, setHeader] = useState<HeaderInfo | null>(null);
  const Report = useMemo(
    () =>
      function ReportHeader({ title, activity, subtitle, otherUserId }: ChatThreadHeaderProps) {
        const sub = activity ?? subtitle;
        useEffect(() => {
          setHeader((h) => (h && h.title === title && h.subtitle === sub && h.otherUserId === otherUserId ? h : { title, subtitle: sub, otherUserId }));
        }, [title, sub, otherUserId]);
        return null;
      },
    [],
  );

  if (item.type === "panel") {
    return (
      <>
        <DockTitleBar
          item={item}
          title={item.title}
          avatar={item.icon ? <span className="flex h-8 w-8 shrink-0 items-center justify-center">{item.icon}</span> : <UserAvatar name={item.title} size="sm" />}
          subtitle={null}
          unread={unread}
          labels={labels}
          inSheet={inSheet}
          toggleRef={toggleRef}
        />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" hidden={!visible} data-testid="genesis-chat-dock-panel">
          {item.render()}
        </div>
      </>
    );
  }

  const row = inbox.get(item.conversationId);
  const title = item.title ?? header?.title ?? conversationTitle(item, inbox, resolveUser, labels);
  const otherId = header?.otherUserId ?? row?.otherUserId ?? null;
  const other = otherId ? resolveUser(otherId) : null;
  return (
    <>
      <DockTitleBar
        item={item}
        title={title}
        avatar={<UserAvatar name={title} src={other?.avatarUrl} size="sm" />}
        subtitle={visible ? (header?.subtitle ?? null) : null}
        unread={visible ? 0 : unread}
        labels={labels}
        inSheet={inSheet}
        toggleRef={toggleRef}
      />
      <div className="flex min-h-0 flex-1 flex-col" hidden={!visible} data-testid="genesis-chat-dock-body">
        <ChatThread
          {...threadProps}
          conversationId={item.conversationId}
          resolveUser={resolveUser}
          {...(item.title ? { title: item.title } : {})}
          // Out of sight it keeps its draft, and reads nothing.
          markRead={visible}
          autoFocus={visible && focus}
          className={cn("min-h-0 flex-1", threadProps?.className)}
          slots={{ ...threadProps?.slots, header: Report }}
        />
      </div>
    </>
  );
}

function isEscape(e: KeyboardEvent<HTMLElement>): boolean {
  // Not while an input method is composing (Escape cancels the composition there), and not when
  // something inside (a menu, the emoji picker) already handled it.
  return e.key === "Escape" && !e.defaultPrevented && !e.nativeEvent.isComposing && e.keyCode !== 229;
}

function DockWindow(props: Omit<ItemProps, "inSheet" | "visible" | "toggleRef">) {
  const dock = useChatDock();
  const { item } = props;
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (!isEscape(e) || item.minimized) return;
    e.preventDefault();
    dock.minimize(item.id);
    // The composer it was in is about to hide: focus stays in the window, on its bar.
    toggleRef.current?.focus();
  };
  return (
    <section
      aria-label={itemTitle(item, props.inbox, props.resolveUser, props.labels)}
      onKeyDown={onKeyDown}
      className={cn(
        "pointer-events-auto flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-t-xl border border-b-0 bg-background shadow-xl",
        // An open window is at most 26rem tall, and never more than 60% of the screen's height,
        // so the page under it stays in view.
        item.minimized ? "h-auto" : "h-[min(26rem,60dvh)]",
      )}
      data-testid="genesis-chat-dock-window"
      data-minimized={item.minimized || undefined}
    >
      <DockItemView {...props} inSheet={false} visible={!item.minimized} toggleRef={toggleRef} />
    </section>
  );
}

function SheetSwitcher({ items, activeId, inbox, resolveUser, labels }: { items: ChatDockItem[]; activeId: string; inbox: Map<string, ChatInboxItem>; resolveUser: ResolveUser; labels: ChatDockLabels }) {
  const dock = useChatDock();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const at = items.findIndex((i) => i.id === activeId);
    const to = e.key === "ArrowRight" ? at + 1 : e.key === "ArrowLeft" ? at - 1 : e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    const next = items[(to + items.length) % items.length]!;
    dock.activate(next.id);
    tabs.current[items.indexOf(next)]?.focus();
  };
  return (
    <div role="tablist" aria-label={labels.sheetTitle} onKeyDown={onKeyDown} className="flex shrink-0 gap-1 overflow-x-auto border-b px-2 py-1.5" data-testid="genesis-chat-dock-switcher">
      {items.map((i, n) => {
        const selected = i.id === activeId;
        const count = selected ? 0 : itemUnread(i, inbox);
        return (
          <button
            key={i.id}
            ref={(el) => {
              tabs.current[n] = el;
            }}
            type="button"
            role="tab"
            id={`genesis-chat-dock-tab-${i.id}`}
            aria-selected={selected}
            aria-controls={`genesis-chat-dock-panel-${i.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => dock.activate(i.id)}
            className={cn(
              "flex min-h-9 max-w-[10rem] shrink-0 items-center gap-1.5 rounded-full px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-accent/60",
            )}
          >
            <span className="truncate">{itemTitle(i, inbox, resolveUser, labels)}</span>
            {count > 0 ? (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground" aria-label={labels.unread(count)}>
                {count > 99 ? "99+" : count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The dock's windows (wide screens) or its sheet and bubble (narrow). Render it once, under
 * `ChatDockProvider`: in AppShell's `dock` slot, or anywhere fixed positioning is free.
 */
export function ChatDock({ resolveUser, threadProps, labels: labelOverrides, bubble = true, className }: ChatDockProps) {
  const dock = useChatDock();
  const narrow = useIsMobile();
  const width = useViewportWidth();
  const labels = useMemo(() => ({ ...defaultChatDockLabels, ...labelOverrides }), [labelOverrides]);
  // The same query the inbox uses, so titles and unread counts come from its cache and stay live.
  const { items: inboxItems } = useInbox();
  const inbox = useMemo(() => new Map(inboxItems.map((i) => [i.conversationId, i])), [inboxItems]);

  if (dock.items.length === 0) return null;

  const active = dock.items.find((i) => i.id === dock.activeId) ?? dock.items[0]!;
  const seen = (i: ChatDockItem) => (narrow ? dock.sheetOpen && i.id === active.id : !i.minimized);
  const unreadTotal = dock.items.reduce((n, i) => n + (seen(i) ? 0 : itemUnread(i, inbox)), 0);
  const announce = (
    <span className="sr-only" aria-live="polite" data-testid="genesis-chat-dock-announce">
      {labels.unreadTotal(unreadTotal)}
    </span>
  );

  if (narrow) {
    return (
      <>
        {announce}
        {bubble && !dock.sheetOpen ? (
          <div className={cn("pointer-events-none flex justify-end p-4", className)}>
            <button
              type="button"
              onClick={() => dock.setSheetOpen(true)}
              aria-label={`${labels.openDock}${unreadTotal > 0 ? `, ${labels.unread(unreadTotal)}` : ""}`}
              aria-haspopup="dialog"
              className="pointer-events-auto relative flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              data-testid="genesis-chat-dock-bubble"
            >
              <MessageCircle className="h-6 w-6" aria-hidden />
              {unreadTotal > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-semibold text-destructive-foreground ring-2 ring-background" aria-hidden>
                  {unreadTotal > 99 ? "99+" : unreadTotal}
                </span>
              ) : null}
            </button>
          </div>
        ) : null}
        <Sheet open={dock.sheetOpen} onOpenChange={dock.setSheetOpen}>
          <SheetContent side="right" showCloseButton={false} className="flex w-full flex-col gap-0 p-0 sm:max-w-md" data-testid="genesis-chat-dock-sheet">
            <SheetTitle className="sr-only">{labels.sheetTitle}</SheetTitle>
            <SheetDescription className="sr-only">{labels.sheetDescription}</SheetDescription>
            {dock.items.length > 1 ? <SheetSwitcher items={dock.items} activeId={active.id} inbox={inbox} resolveUser={resolveUser} labels={labels} /> : null}
            {/* Every one stays mounted, so switching tabs keeps each one's draft. */}
            {dock.items.map((i) => (
              <div
                key={i.id}
                role={dock.items.length > 1 ? "tabpanel" : undefined}
                id={`genesis-chat-dock-panel-${i.id}`}
                aria-labelledby={dock.items.length > 1 ? `genesis-chat-dock-tab-${i.id}` : undefined}
                hidden={i.id !== active.id}
                className="flex min-h-0 flex-1 flex-col"
              >
                <DockItemView
                  item={i}
                  inbox={inbox}
                  resolveUser={resolveUser}
                  threadProps={threadProps}
                  labels={labels}
                  inSheet
                  visible={dock.sheetOpen && i.id === active.id}
                  focus={dock.focusId === i.id}
                />
              </div>
            ))}
          </SheetContent>
        </Sheet>
      </>
    );
  }

  // As many as fit side by side; the rest wait behind "+N".
  const shown = dock.items.slice(0, chatDockWindowsThatFit(width, dock.items.length));
  const waiting = dock.items.slice(shown.length);
  return (
    <div className={cn("pointer-events-none flex flex-row-reverse items-end gap-3 px-4", className)} data-testid="genesis-chat-dock">
      {announce}
      {shown.map((item) => (
        <DockWindow key={item.id} item={item} inbox={inbox} resolveUser={resolveUser} threadProps={threadProps} labels={labels} focus={dock.focusId === item.id} />
      ))}
      {waiting.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="secondary"
              className="pointer-events-auto mb-1 h-11 min-w-11 rounded-full shadow-lg"
              style={{ width: MORE_PX - GAP_PX }}
              aria-label={labels.moreLabel(waiting.length)}
              data-testid="genesis-chat-dock-more"
            >
              {labels.more(waiting.length)}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top">
            {waiting.map((i) => (
              <DropdownMenuItem key={i.id} onSelect={() => dock.bringToFront(i.id)}>
                {itemTitle(i, inbox, resolveUser, labels)}
                {itemUnread(i, inbox) > 0 ? ` (${labels.unread(itemUnread(i, inbox))})` : ""}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
