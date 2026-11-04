/**
 * InboxLayout — the 3-pane inbox on the web: views (Mine, Unassigned, All), a
 * list of conversations, the open thread, and a context sidebar (who it's
 * from, properties, linked work).
 *
 * It only positions its panes: fill them with `InboxViews`, `InboxPage` and
 * `ThreadPage` (or the app's own), and keep which conversation is open where
 * the app keeps it, its router's URL param. On narrow screens it shows one
 * pane at a time, like the phone: the list, or the thread with a Back button
 * (`onBack`) when `threadOpen`. The views rail shows from `lg` up.
 *
 * The context sidebar toggles: controlled (`contextOpen` /
 * `onContextOpenChange`), or on its own, remembered per viewer under
 * `contextStorageKey`. From `xl` up it sits beside the thread; below that, it
 * opens as a sheet over it, only when the toggle asks.
 *
 * Keyboard (`shortcuts`): each key is a callback the app can leave out. They
 * work only while focus is inside the layout, and never while typing in a
 * field or inside a dialog, menu, list box, grid or tree. j / k: next and
 * previous conversation; r: reply; n: internal note; e: solve or close;
 * a: assign; Escape: back. To let people turn single-key shortcuts off
 * (WCAG 2.1.4), keep a setting and pass `shortcuts={undefined}` when it's off.
 *
 * On the server, and in the first render on the client, the layout is narrow
 * and the sidebar at its default, so hydration matches; the viewport and the
 * remembered setting apply right after.
 *
 * @stability Beta
 */
import * as React from "react";
import { usePersistedUiState } from "@marktiderman/genesis-core/hooks";
import { ChevronLeft, PanelRight } from "lucide-react";
import { cn } from "../../../utils";
import { useMediaQuery } from "../../../hooks/use-mobile";
import { Button } from "../../ui/button";
import { Sheet, SheetContent, SheetTitle } from "../../ui/sheet";

export interface InboxShortcuts {
  /** j */
  onNext?: () => void;
  /** k */
  onPrevious?: () => void;
  /** r */
  onReply?: () => void;
  /** n */
  onNote?: () => void;
  /** e */
  onClose?: () => void;
  /** a */
  onAssign?: () => void;
  /** Escape */
  onBack?: () => void;
}

export interface InboxLayoutProps {
  /** The views rail (`InboxViews`). Hidden below `lg`. */
  views?: React.ReactNode;
  /** The list of conversations (an `InboxPage`). */
  list: React.ReactNode;
  /** The open conversation (a `ThreadPage`), or what shows when none is open. */
  thread?: React.ReactNode;
  /** Beside the thread from `xl` up, a sheet below: who it's from, its properties, linked work. */
  context?: React.ReactNode;
  /** Whether the context sidebar is open (controlled). */
  contextOpen?: boolean;
  onContextOpenChange?: (open: boolean) => void;
  /** Uncontrolled: open at first. Default true. */
  defaultContextOpen?: boolean;
  /** Uncontrolled: remember open or closed in this browser under this key. */
  contextStorageKey?: string;
  /** A conversation is open: on narrow screens the thread shows instead of the list. */
  threadOpen?: boolean;
  /** Back to the list on narrow screens. Without it, no Back button shows. */
  onBack?: () => void;
  shortcuts?: InboxShortcuts;
  /** Words the layout says. */
  labels?: { views?: string; list?: string; thread?: string; context?: string; back?: string; toggleContext?: string };
  className?: string;
  testID?: string;
}

const XL_QUERY = "(min-width: 1280px)";

/** The remembered context panel, stored as "1" / "0" under `contextStorageKey`. */
const OPEN_FORMAT = { parse: (raw: string) => raw === "1", serialize: (open: boolean) => (open ? "1" : "0") };

const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) ||
    el.closest("[role=combobox],[role=menu],[role=menubar],[role=dialog],[role=alertdialog],[role=listbox],[role=grid],[role=tree],[role=textbox]") !== null);

export function InboxLayout({
  views,
  list,
  thread,
  context,
  contextOpen: contextOpenProp,
  onContextOpenChange,
  defaultContextOpen = true,
  contextStorageKey,
  threadOpen = false,
  onBack,
  shortcuts,
  labels = {},
  className,
  testID = "inbox-layout",
}: InboxLayoutProps) {
  const wide = useMediaQuery(XL_QUERY, false);
  // The remembered setting (usePersistedUiState: SSR-safe, and it still works for this visit when
  // storage is off). Without a key, it lasts this visit.
  const [ownOpen, setOwnOpen] = usePersistedUiState(contextStorageKey ?? null, defaultContextOpen, OPEN_FORMAT);
  const contextOpen = contextOpenProp ?? ownOpen;
  const setContextOpen = (open: boolean) => {
    if (contextOpenProp === undefined) setOwnOpen(open);
    onContextOpenChange?.(open);
  };

  // Below xl the sidebar is a sheet: it opens only when asked, whatever the remembered setting.
  const [sheetOpen, setSheetOpen] = React.useState(false);
  React.useEffect(() => {
    if (wide) setSheetOpen(false);
  }, [wide]);
  const toggle = () => (wide ? setContextOpen(!contextOpen) : setSheetOpen(!sheetOpen));

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!shortcuts || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || typing(e.target)) return;
    const s = shortcuts;
    const run: Record<string, (() => void) | undefined> = { j: s.onNext, k: s.onPrevious, r: s.onReply, n: s.onNote, e: s.onClose, a: s.onAssign, Escape: s.onBack };
    const fn = run[e.key];
    if (fn) {
      e.preventDefault();
      fn();
    }
  };

  const toggleLabel = labels.toggleContext ?? "Details";
  return (
    <div data-testid={testID} onKeyDown={onKeyDown} className={cn("flex h-full min-h-0 w-full overflow-hidden", className)}>
      {views ? (
        <nav data-testid={`${testID}-views`} aria-label={labels.views ?? "Views"} className="hidden w-56 shrink-0 overflow-y-auto border-r lg:block">
          {views}
        </nav>
      ) : null}
      <section
        data-testid={`${testID}-list`}
        aria-label={labels.list ?? "Conversations"}
        className={cn("min-h-0 w-full shrink-0 flex-col overflow-y-auto border-r md:flex md:w-80 lg:w-96", threadOpen ? "hidden" : "flex")}
      >
        {list}
      </section>
      <section
        data-testid={`${testID}-thread`}
        aria-label={labels.thread ?? "Conversation"}
        className={cn("relative min-h-0 min-w-0 flex-1 flex-col md:flex", threadOpen ? "flex" : "hidden")}
      >
        {onBack || context ? (
          <div className="flex items-center border-b p-1">
            {onBack ? (
              <Button variant="ghost" size="sm" onClick={onBack} data-testid={`${testID}-back`} className="h-11 md:hidden">
                <ChevronLeft className="size-4" aria-hidden />
                {labels.back ?? "Back"}
              </Button>
            ) : null}
            {context ? (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto size-11"
                aria-pressed={wide ? contextOpen : sheetOpen}
                aria-label={toggleLabel}
                onClick={toggle}
                data-testid={`${testID}-toggle-context`}
              >
                <PanelRight className="size-4" aria-hidden />
              </Button>
            ) : null}
          </div>
        ) : null}
        <div className="flex min-h-0 flex-1 flex-col">{thread}</div>
      </section>
      {context && contextOpen && wide ? (
        <aside data-testid={`${testID}-context`} aria-label={labels.context ?? "Details"} className="w-80 shrink-0 overflow-y-auto border-l">
          {context}
        </aside>
      ) : null}
      {context && !wide ? (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="right" data-testid={`${testID}-context-sheet`} className="w-80 overflow-y-auto p-0">
            <SheetTitle className="sr-only">{labels.context ?? "Details"}</SheetTitle>
            {context}
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  );
}
