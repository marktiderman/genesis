/**
 * InboxPage — a list of conversations on the web: rows with an unread dot or
 * count, a short time (`9:41`, `Yesterday`, a weekday, a date), a two-line
 * preview and a status line, paging, and loading, error and empty states.
 *
 * The web twin of ui-native's `InboxPage`, with the same props and slots, on
 * the shared conversation contract (`@marktiderman/genesis-core/conversation`):
 * the same `InboxItem[]` renders on both. Each row's `swipeActions` (a swipe on
 * the phone) are a "More" menu on the row here, so they're always reachable
 * by mouse, keyboard and screen reader. A `selected` row is the conversation
 * open beside the list (`InboxLayout`), marked `aria-current`.
 *
 * Keyboard: the list is one tab stop; Up and Down (or j and k) move between
 * rows, Enter opens one.
 *
 * Slots: `row`, `header` (above the list), `footer` (below it), `empty`.
 *
 * @stability Beta
 */
import * as React from "react";
import { MoreHorizontal } from "lucide-react";
import { renderSlot, type SlotPropsFor, type Slots } from "@marktiderman/genesis-core/slots";
import { formatInboxTime, type InboxItem, type InboxSwipeAction } from "@marktiderman/genesis-core/conversation";
import { cn } from "../../../utils";
import { Button } from "../../ui/button";
import { Skeleton } from "../../ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../ui/dropdown-menu";

export type InboxPageSlotMap = {
  row: InboxItem & { testID: string; isFirst: boolean; isLast: boolean; timeLabel: string | null };
  header: { testID: string };
  footer: { loadingMore: boolean; testID: string };
  empty: { title: string; body: string; actionLabel?: string; onAction?: () => void; testID: string };
};

export interface InboxPageProps {
  /** Newest first, as they should show. Empty → the empty state. */
  items: InboxItem[];
  /** Called near the end of the list, to load the next page. */
  onEndReached?: () => void;
  /** A next page is loading: the default footer shows a spinner. */
  loadingMore?: boolean;
  /** Above the list (a filter, a call to action). Prefer `slots.header` for a component. */
  header?: React.ReactNode;
  /** An optional title over the list. */
  sectionTitle?: string;
  emptyTitle?: string;
  emptyBody?: string;
  /** The first page is loading: a skeleton instead of the empty state. */
  loading?: boolean;
  /** The read failed: the empty slot shows `errorTitle` / `errorBody` instead. */
  error?: boolean;
  errorTitle?: string;
  errorBody?: string;
  /** A button in the empty state ("Send feedback"). */
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  /** Accepted for parity with native, where it's pull to refresh; the web refreshes from the app. */
  refreshing?: boolean;
  onRefresh?: () => void | Promise<void>;
  /** The list's name, for a screen reader. Default "Conversations". */
  label?: string;
  /** "More" on a row's action menu. */
  moreLabel?: string;
  /** How a row's time reads. Default: the time today, "Yesterday", the weekday this week, else the date. */
  formatTime?: (date: Date, now: Date) => string;
  /** The clock, for tests. */
  now?: () => Date;
  slots?: Slots<InboxPageSlotMap>;
  slotProps?: SlotPropsFor<InboxPageSlotMap>;
  className?: string;
  /** testID on the root. Default `"inbox-page"`. */
  testID?: string;
}

const toDate = (value: string | Date) => (typeof value === "string" ? new Date(value) : value);

export function InboxPage({
  items,
  onEndReached,
  loadingMore = false,
  header,
  sectionTitle,
  emptyTitle = "Nothing here yet",
  emptyBody = "Conversations will show up here.",
  loading = false,
  error = false,
  errorTitle = "Couldn't load these",
  errorBody = "Check your connection and try again.",
  emptyActionLabel,
  onEmptyAction,
  label = "Conversations",
  moreLabel = "More",
  formatTime = formatInboxTime,
  now = () => new Date(),
  slots = {},
  slotProps = {},
  className,
  testID = "inbox-page",
}: InboxPageProps) {
  const listRef = React.useRef<HTMLUListElement | null>(null);
  const endSentinel = React.useRef<HTMLDivElement | null>(null);
  const clock = now();

  React.useEffect(() => {
    const target = endSentinel.current;
    if (!target || !onEndReached || loadingMore || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) onEndReached();
    }, { rootMargin: "0px 0px 300px 0px" });
    io.observe(target);
    return () => io.disconnect();
  }, [onEndReached, loadingMore, items.length]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLUListElement>) => {
    const keys: Record<string, number> = { ArrowDown: 1, j: 1, ArrowUp: -1, k: -1 };
    const step = keys[e.key];
    if (!step || e.metaKey || e.ctrlKey || e.altKey) return;
    const rows = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-inbox-row]") ?? [])];
    const at = rows.indexOf(document.activeElement as HTMLElement);
    const next = rows[Math.min(rows.length - 1, Math.max(0, at + step))];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };

  const headerNode = header ?? renderSlot(Nothing, slots.header, { testID: `${testID}-header` }, slotProps.header);

  if (loading && items.length === 0) {
    return (
      <div data-testid={testID} className={cn("flex flex-col", className)}>
        {headerNode}
        <div data-testid={`${testID}-loading`} role="status" aria-label="Loading" className="flex flex-col gap-3 p-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="size-10 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div data-testid={testID} className={cn("flex min-h-0 flex-col", className)}>
      {headerNode}
      {sectionTitle ? <h2 className="px-4 pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{sectionTitle}</h2> : null}
      {items.length === 0 ? (
        renderSlot(
          DefaultEmpty,
          slots.empty,
          error
            ? { title: errorTitle, body: errorBody, testID: `${testID}-empty` }
            : { title: emptyTitle, body: emptyBody, actionLabel: emptyActionLabel, onAction: onEmptyAction, testID: `${testID}-empty` },
          slotProps.empty,
        )
      ) : (
        <ul ref={listRef} aria-label={label} onKeyDown={onKeyDown} className="flex flex-col divide-y overflow-y-auto">
          {items.map((item, index) => {
            const time = item.timestamp ? formatTime(toDate(item.timestamp), clock) : null;
            return (
              <li key={item.id}>
                {renderSlot(
                  DefaultRow,
                  slots.row,
                  {
                    ...item,
                    testID: item.testID ?? `${testID}-row-${item.id}`,
                    isFirst: index === 0,
                    isLast: index === items.length - 1,
                    timeLabel: time,
                    moreLabel,
                    tabIndex: item.selected || (index === 0 && !items.some((i) => i.selected)) ? 0 : -1,
                  } as InboxPageSlotMap["row"],
                  slotProps.row,
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div ref={endSentinel} aria-hidden />
      {renderSlot(DefaultFooter, slots.footer, { loadingMore, testID: `${testID}-footer` }, slotProps.footer)}
    </div>
  );
}

function Nothing(_props: { testID: string }) {
  return null;
}

function DefaultRow(row: InboxPageSlotMap["row"] & { moreLabel?: string; tabIndex?: number }) {
  const unread = Boolean(row.unread || (row.unreadCount ?? 0) > 0);
  const actions: InboxSwipeAction[] = row.swipeActions ?? [];
  return (
    <div className={cn("group relative flex items-stretch", row.selected && "bg-muted")}>
      <button
        type="button"
        data-testid={row.testID}
        data-inbox-row=""
        tabIndex={row.tabIndex}
        aria-current={row.selected ? "true" : undefined}
        onClick={row.onPress}
        className="flex min-h-14 flex-1 items-start gap-3 px-3 py-2.5 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="flex w-2.5 shrink-0 justify-center pt-1.5">
          {row.leading ?? (unread && !(row.unreadCount && row.unreadCount > 0) ? <span data-testid={`${row.testID}-unread`} className="size-2.5 rounded-full bg-primary" aria-hidden /> : null)}
        </span>
        {row.avatar ? <span className="shrink-0" aria-hidden>{row.avatar}</span> : null}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-baseline gap-2">
            {row.avatarLabel ? <span className="sr-only">{row.avatarLabel}, </span> : null}
            <span className={cn("truncate", unread ? "font-semibold" : "font-medium")}>{row.title}</span>
            {unread ? <span className="sr-only">, unread</span> : null}
            {row.timeLabel ? <span className="ml-auto shrink-0 text-xs text-muted-foreground">{row.timeLabel}</span> : null}
          </span>
          {row.preview ? <span className="line-clamp-2 text-sm text-muted-foreground">{row.preview}</span> : null}
          {row.meta ? <span className="mt-0.5 text-xs text-muted-foreground">{row.meta}</span> : null}
        </span>
        {row.unreadCount && row.unreadCount > 0 ? (
          <span data-testid={`${row.testID}-count`} className="mt-1 min-w-5 shrink-0 rounded-full bg-primary px-1.5 text-center text-xs font-medium leading-5 text-primary-foreground">
            {row.unreadCount}
          </span>
        ) : null}
      </button>
      {row.trailing ? <span className="flex shrink-0 items-center pr-2">{row.trailing}</span> : null}
      {actions.length ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`${row.moreLabel ?? "More"}: ${row.title}`} data-testid={`${row.testID}-more`} className="my-auto mr-1 shrink-0">
              <MoreHorizontal className="size-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {actions.map((a) => (
              <DropdownMenuItem key={a.id} onSelect={a.onPress} className={a.destructive ? "text-destructive focus:text-destructive" : undefined} data-testid={`${row.testID}-action-${a.id}`}>
                {a.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

function DefaultFooter({ loadingMore, testID }: InboxPageSlotMap["footer"]) {
  return loadingMore ? (
    <div data-testid={testID} role="status" aria-label="Loading more" className="flex justify-center p-3">
      <Skeleton className="h-4 w-24" />
    </div>
  ) : null;
}

function DefaultEmpty({ title, body, actionLabel, onAction, testID }: InboxPageSlotMap["empty"]) {
  return (
    <div data-testid={testID} className="px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      {actionLabel && onAction ? (
        <Button className="mt-4" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
