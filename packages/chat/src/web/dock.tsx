/**
 * @feat:chat-dock
 * The chat dock: conversations that stay open while you move around the app. On a wide screen up
 * to three windows sit bottom-right, each with its own thread and composer, minimized to a bar or
 * closed; a fourth replaces the one used longest ago. On a narrow screen the open ones share one
 * side sheet with a switcher, and a bubble (with the unread count) brings it back. "Expand" opens
 * the zone's own Messages page through `onExpand`.
 *
 * A conversation opens with `useChatDock().open(conversationId)`. Anything else that should live
 * in the dock (a help desk messenger) opens with `openPanel({ id, title, render })`: the dock
 * draws the window, the panel draws what's in it.
 *
 * Mount `ChatDockProvider` under `ChatProvider`, around the app, and `<ChatDock />` once: in
 * AppShell's `dock` slot, which keeps it clear of the phone's bottom bar.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type KeyboardEvent, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Maximize2, MessageCircle, X } from "lucide-react";
import { Button, Sheet, SheetContent, SheetDescription, SheetTitle, UserAvatar, cn } from "@marktiderman/genesis-ui";
import { useIsMobile } from "@marktiderman/genesis-ui/hooks";
import type { ChatInboxItem } from "../core/types";
import { useInbox } from "../react/index";
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
  /** Most recently opened or brought back first. */
  items: ChatDockItem[];
  /** The one the narrow screen's sheet shows. */
  activeId: string | null;
  /** Whether the narrow screen's sheet is open. */
  sheetOpen: boolean;
}

export type ChatDockAction =
  | { type: "open"; item: ChatDockItem }
  | { type: "close"; id: string }
  | { type: "minimize"; id: string; minimized: boolean }
  | { type: "sheet"; open: boolean }
  | { type: "closeAll" };

export const emptyChatDock: ChatDockState = { items: [], activeId: null, sheetOpen: false };

/**
 * The dock's state machine, pure. Opening puts the item first, open (not minimized), and active;
 * past `max` the last (used longest ago) goes. Closing the active one makes the next active.
 */
export function chatDockReducer(state: ChatDockState, action: ChatDockAction, max = 3): ChatDockState {
  switch (action.type) {
    case "open": {
      const rest = state.items.filter((i) => i.id !== action.item.id);
      const items = [{ ...action.item, minimized: false }, ...rest].slice(0, Math.max(1, max));
      return { items, activeId: action.item.id, sheetOpen: true };
    }
    case "close": {
      const items = state.items.filter((i) => i.id !== action.id);
      if (items.length === state.items.length) return state;
      const activeId = state.activeId === action.id ? (items[0]?.id ?? null) : state.activeId;
      return { items, activeId, sheetOpen: state.sheetOpen && items.length > 0 };
    }
    case "minimize": {
      if (!state.items.some((i) => i.id === action.id && i.minimized !== action.minimized)) return state;
      const items = state.items.map((i) => (i.id === action.id ? { ...i, minimized: action.minimized } : i));
      return { ...state, items };
    }
    case "sheet": {
      const sheetOpen = action.open && state.items.length > 0;
      return sheetOpen === state.sheetOpen ? state : { ...state, sheetOpen };
    }
    case "closeAll":
      return emptyChatDock;
  }
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
  /** Opens a conversation in the dock, or brings it back if it's there. */
  open: (conversationId: string, opts?: OpenConversationOptions) => void;
  /** Opens a panel of your own in the dock (the help desk messenger), or brings it back. */
  openPanel: (panel: OpenPanelInput) => void;
  close: (id: string) => void;
  closeAll: () => void;
  minimize: (id: string) => void;
  restore: (id: string) => void;
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
   * browser's localStorage under this key. They come back as bars, so nothing opens over the
   * page on load. Off by default.
   */
  storageKey?: string;
  children: ReactNode;
}

const DockContext = createContext<ChatDockApi | null>(null);

interface StoredItem {
  conversationId: string;
  title?: string;
}

function readStored(key: string | undefined, max: number): ChatDockState {
  if (!key || typeof window === "undefined") return emptyChatDock;
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return emptyChatDock;
    const items: ChatDockItem[] = parsed
      .filter((s): s is StoredItem => !!s && typeof (s as StoredItem).conversationId === "string" && (s as StoredItem).conversationId !== "")
      .slice(0, max)
      .map((s) => ({
        type: "conversation",
        id: s.conversationId,
        conversationId: s.conversationId,
        ...(typeof s.title === "string" ? { title: s.title } : {}),
        minimized: true,
      }));
    // Brought back as bars: nothing opens over the page on load.
    return { items, activeId: items[0]?.id ?? null, sheetOpen: false };
  } catch {
    return emptyChatDock;
  }
}

function writeStored(key: string | undefined, items: ChatDockItem[]) {
  if (!key || typeof window === "undefined") return;
  try {
    const stored: StoredItem[] = items
      .filter((i): i is ChatDockConversation => i.type === "conversation")
      .map((i) => ({ conversationId: i.conversationId, ...(i.title ? { title: i.title } : {}) }));
    if (stored.length === 0) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(stored));
  } catch {
    // Storage blocked (a private window): the dock still works, it just forgets.
  }
}

export function ChatDockProvider({ max = 3, onExpand, storageKey, children }: ChatDockProviderProps) {
  const [state, dispatch] = useReducer(
    (s: ChatDockState, a: ChatDockAction) => chatDockReducer(s, a, max),
    undefined,
    () => readStored(storageKey, max),
  );
  useEffect(() => writeStored(storageKey, state.items), [storageKey, state.items]);

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
  const close = useCallback((id: string) => dispatch({ type: "close", id }), []);
  const closeAll = useCallback(() => dispatch({ type: "closeAll" }), []);
  const minimize = useCallback((id: string) => dispatch({ type: "minimize", id, minimized: true }), []);
  const restore = useCallback((id: string) => dispatch({ type: "minimize", id, minimized: false }), []);
  const setSheetOpen = useCallback((o: boolean) => dispatch({ type: "sheet", open: o }), []);
  const canExpand = useCallback(
    (item: ChatDockItem) => (item.type === "panel" && !!item.onExpand) || !!expandRef.current,
    // The provider's onExpand may change identity every render; whether there is one rarely does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [!!onExpand],
  );
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
      sheetOpen: state.sheetOpen,
      open,
      openPanel,
      close,
      closeAll,
      minimize,
      restore,
      expand,
      canExpand,
      setSheetOpen,
    }),
    [state, open, openPanel, close, closeAll, minimize, restore, expand, canExpand, setSheetOpen],
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
  conversation: "Conversation",
};

export interface ChatDockProps {
  resolveUser: ResolveUser;
  /** Passed to every docked conversation's ChatThread. */
  threadProps?: Partial<Omit<ChatThreadProps, "conversationId" | "resolveUser" | "onBack" | "title">>;
  labels?: Partial<ChatDockLabels>;
  /** The narrow screen's bubble when the sheet is closed. Default true. */
  bubble?: boolean;
  className?: string;
}

interface WindowControls {
  item: ChatDockItem;
  title: string;
  avatar: ReactNode;
  subtitle: string | null;
  unread: number;
  labels: ChatDockLabels;
  /** On the narrow screen: no minimize (the sheet closes instead). */
  inSheet: boolean;
}

function DockTitleBar({ item, title, avatar, subtitle, unread, labels, inSheet }: WindowControls) {
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
}

function conversationTitle(item: ChatDockConversation, inbox: Map<string, ChatInboxItem>, resolveUser: ResolveUser, labels: ChatDockLabels): string {
  if (item.title) return item.title;
  const row = inbox.get(item.conversationId);
  return row ? inboxTitle(row, resolveUser, () => labels.conversation) : labels.conversation;
}

function itemUnread(item: ChatDockItem, inbox: Map<string, ChatInboxItem>): number {
  if (item.type === "panel") return item.unread ?? 0;
  const row = inbox.get(item.conversationId);
  return row && !row.muted ? row.unread : 0;
}

function DockItemView({ item, inbox, resolveUser, threadProps, labels, inSheet }: ItemProps) {
  const unread = itemUnread(item, inbox);
  const body = !item.minimized || inSheet;

  if (item.type === "panel") {
    return (
      <>
        <DockTitleBar item={item} title={item.title} avatar={item.icon ? <span className="flex h-8 w-8 shrink-0 items-center justify-center">{item.icon}</span> : <UserAvatar name={item.title} size="sm" />} subtitle={null} unread={unread} labels={labels} inSheet={inSheet} />
        {body ? <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-testid="genesis-chat-dock-panel">{item.render()}</div> : null}
      </>
    );
  }

  const known = conversationTitle(item, inbox, resolveUser, labels);
  const row = inbox.get(item.conversationId);
  const other = row?.otherUserId ? resolveUser(row.otherUserId) : null;
  if (!body) {
    // A bar: the thread isn't mounted, so it isn't marked read behind your back.
    return <DockTitleBar item={item} title={known} avatar={<UserAvatar name={known} src={other?.avatarUrl} size="sm" />} subtitle={null} unread={unread} labels={labels} inSheet={inSheet} />;
  }
  return (
    <ChatThread
      {...threadProps}
      conversationId={item.conversationId}
      resolveUser={resolveUser}
      {...(item.title ? { title: item.title } : {})}
      className={cn("min-h-0 flex-1", threadProps?.className)}
      slots={{
        ...threadProps?.slots,
        // The dock's title bar is the thread's header: one bar, with the thread's own title,
        // avatar and "typing…".
        header: (h: ChatThreadHeaderProps) => {
          const person = h.otherUserId ? resolveUser(h.otherUserId) : null;
          return (
            <DockTitleBar
              item={item}
              title={h.title}
              avatar={<UserAvatar name={h.title} src={person?.avatarUrl} size="sm" />}
              subtitle={h.activity ?? h.subtitle}
              unread={0}
              labels={labels}
              inSheet={inSheet}
            />
          );
        },
      }}
    />
  );
}

function onWindowKey(e: KeyboardEvent<HTMLElement>, minimize: () => void) {
  // Escape minimizes the window it's pressed in, unless something inside (a menu, the emoji
  // picker) already handled it.
  if (e.key === "Escape" && !e.defaultPrevented) {
    e.preventDefault();
    minimize();
  }
}

/**
 * The dock's windows (wide screens) or its sheet and bubble (narrow). Render it once, under
 * `ChatDockProvider`: in AppShell's `dock` slot, or anywhere fixed positioning is free.
 */
export function ChatDock({ resolveUser, threadProps, labels: labelOverrides, bubble = true, className }: ChatDockProps) {
  const dock = useChatDock();
  const narrow = useIsMobile();
  const labels = useMemo(() => ({ ...defaultChatDockLabels, ...labelOverrides }), [labelOverrides]);
  const hasConversations = dock.items.some((i) => i.type === "conversation");
  // The same query the inbox uses, so titles and unread counts come from its cache and stay live.
  const { items: inboxItems } = useInbox();
  const inbox = useMemo(() => new Map(inboxItems.map((i) => [i.conversationId, i])), [inboxItems]);

  if (dock.items.length === 0) return null;

  if (narrow) {
    const active = dock.items.find((i) => i.id === dock.activeId) ?? dock.items[0]!;
    const unreadTotal = dock.items.reduce((n, i) => n + (i.id === active.id && dock.sheetOpen ? 0 : itemUnread(i, inbox)), 0);
    return (
      <>
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
            {dock.items.length > 1 ? (
              <div role="tablist" aria-label={labels.sheetTitle} className="flex shrink-0 gap-1 overflow-x-auto border-b px-2 py-1.5" data-testid="genesis-chat-dock-switcher">
                {dock.items.map((i) => {
                  const title = i.type === "panel" ? i.title : conversationTitle(i, inbox, resolveUser, labels);
                  const n = i.id === active.id ? 0 : itemUnread(i, inbox);
                  return (
                    <button
                      key={i.id}
                      type="button"
                      role="tab"
                      aria-selected={i.id === active.id}
                      onClick={() => (i.type === "panel" ? dock.openPanel(i) : dock.open(i.conversationId, i.title ? { title: i.title } : {}))}
                      className={cn(
                        "flex min-h-9 max-w-[10rem] shrink-0 items-center gap-1.5 rounded-full px-3 text-sm",
                        i.id === active.id ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-accent/60",
                      )}
                    >
                      <span className="truncate">{title}</span>
                      {n > 0 ? (
                        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground" aria-label={labels.unread(n)}>
                          {n > 99 ? "99+" : n}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
            <div className="flex min-h-0 flex-1 flex-col" key={active.id}>
              <DockItemView item={active} inbox={inbox} resolveUser={resolveUser} threadProps={threadProps} labels={labels} inSheet />
            </div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <div
      className={cn("pointer-events-none flex flex-row-reverse items-end gap-3 px-4", className)}
      data-testid="genesis-chat-dock"
      data-conversations={hasConversations || undefined}
    >
      {dock.items.map((item) => (
        <section
          key={item.id}
          aria-label={item.type === "panel" ? item.title : conversationTitle(item, inbox, resolveUser, labels)}
          onKeyDown={(e) => onWindowKey(e, () => dock.minimize(item.id))}
          className={cn(
            "pointer-events-auto flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-t-xl border border-b-0 bg-background shadow-xl",
            item.minimized ? "h-auto" : "h-[32rem] max-h-[calc(100dvh-6rem)]",
          )}
          data-testid="genesis-chat-dock-window"
          data-minimized={item.minimized || undefined}
        >
          <DockItemView item={item} inbox={inbox} resolveUser={resolveUser} threadProps={threadProps} labels={labels} inSheet={false} />
        </section>
      ))}
    </div>
  );
}
