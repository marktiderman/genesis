/**
 * @feat:chat
 * Scheduled send on the web: the send button's menu (tomorrow 9 AM, Monday 9 AM, or a date
 * and time you pick), and `ChatScheduledList`, your messages waiting to go, each with Cancel.
 */
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarClock, ChevronUp, Clock, X } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Input,
  Label,
  Skeleton,
  cn,
  toast,
} from "@marktiderman/genesis-ui";
import { isSchedulable, scheduleLabel, scheduleQuickPicks } from "../core/extras";
import { previewText } from "../core/thread";
import { useScheduled } from "../react/index";

export interface ChatScheduleMenuProps {
  /** Called with the chosen time. */
  onSchedule: (at: Date) => void;
  disabled?: boolean;
  /** For tests and demos. */
  now?: Date;
}

/** `YYYY-MM-DDTHH:mm` in local time, for a datetime-local input. */
export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** The chevron beside Send: "Schedule message" with quick picks and a custom time. */
export function ChatScheduleMenu({ onSchedule, disabled, now }: ChatScheduleMenuProps) {
  const [picking, setPicking] = useState(false);
  const picks = useMemo(() => scheduleQuickPicks(now ?? new Date()), [now]);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="-ml-1 size-8 shrink-0 self-center rounded-full text-muted-foreground"
            disabled={disabled}
            aria-label="Send options"
            data-testid="genesis-chat-send-menu"
          >
            <ChevronUp />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="w-60">
          <DropdownMenuLabel className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarClock className="size-3.5" aria-hidden /> Schedule message
          </DropdownMenuLabel>
          {picks.map((p) => (
            <DropdownMenuItem key={p.label} className="gap-2" onSelect={() => onSchedule(p.at)} data-testid="genesis-chat-schedule-pick">
              <Clock className="size-4" aria-hidden /> {p.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="gap-2" onSelect={() => setPicking(true)} data-testid="genesis-chat-schedule-custom">
            <CalendarClock className="size-4" aria-hidden /> Pick a date and time…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ScheduleDialog open={picking} onOpenChange={setPicking} onSchedule={onSchedule} now={now} />
    </>
  );
}

function ScheduleDialog({ open, onOpenChange, onSchedule, now }: { open: boolean; onOpenChange: (o: boolean) => void; onSchedule: (at: Date) => void; now?: Date }) {
  const base = now ?? new Date();
  const [value, setValue] = useState(() => toLocalInput(new Date(base.getTime() + 60 * 60_000)));
  // The default is an hour from when it opens, not from when the composer first drew.
  useEffect(() => {
    if (open) setValue(toLocalInput(new Date((now ?? new Date()).getTime() + 60 * 60_000)));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const at = new Date(value);
  const ok = isSchedulable(at, now ?? new Date());
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Schedule message</DialogTitle>
          <DialogDescription>It sends at this time, in your time zone, as if you'd sent it then.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ok) return;
            onSchedule(at);
            onOpenChange(false);
          }}
        >
          <Label htmlFor="genesis-chat-schedule-at">Date and time</Label>
          <Input
            id="genesis-chat-schedule-at"
            type="datetime-local"
            value={value}
            min={toLocalInput(new Date(base.getTime() + 60_000))}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={!ok}
            aria-describedby="genesis-chat-schedule-hint"
            data-testid="genesis-chat-schedule-input"
          />
          <p id="genesis-chat-schedule-hint" className={cn("text-xs", ok ? "text-muted-foreground" : "text-destructive")}>
            {ok ? scheduleLabel(at, now ?? new Date()) : "Pick a time from a minute to a year from now."}
          </p>
          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!ok} data-testid="genesis-chat-schedule-confirm">
              Schedule
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export interface ChatScheduledListProps {
  /** One conversation's; all of yours without it. */
  conversationId?: string | null;
  /** Names a conversation in the all-conversations list. */
  conversationTitle?: (conversationId: string) => string;
  className?: string;
}

/** Your scheduled messages, soonest first, each with when it goes and Cancel. */
export function ChatScheduledList({ conversationId, conversationTitle, className }: ChatScheduledListProps) {
  const { items, isLoading, cancel } = useScheduled(conversationId);
  if (isLoading) {
    return (
      <div className={cn("flex flex-col gap-2 p-3", className)} aria-busy aria-label="Loading scheduled messages">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }
  if (items.length === 0) {
    return <EmptyState icon={CalendarClock} title="Nothing scheduled" description="Use the arrow beside Send to schedule a message." className={className} />;
  }
  return (
    <ul className={cn("flex flex-col divide-y", className)} aria-label="Scheduled messages" data-testid="genesis-chat-scheduled-list">
      {items.map((s) => (
        <li key={s.id} className="flex items-start gap-3 px-3 py-2.5" data-testid="genesis-chat-scheduled-item">
          {s.status === "failed" ? <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden /> : <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />}
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-muted-foreground">
              {s.status === "failed" ? "Couldn't send" : scheduleLabel(s.sendAt)}
              {!conversationId && conversationTitle ? ` · ${conversationTitle(s.conversationId)}` : null}
            </div>
            <div className="truncate text-sm">{previewText(s.body, s.attachments[0]?.kind ?? null)}</div>
            {s.error ? <div className="text-xs text-destructive">{s.error}</div> : null}
          </div>
          {s.status === "scheduled" ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 gap-1 text-xs"
              onClick={() => void cancel(s.id).then(() => toast.success("Scheduled message cancelled"), () => toast.error("Couldn't cancel it"))}
              aria-label={`Cancel the message scheduled for ${scheduleLabel(s.sendAt)}`}
              data-testid="genesis-chat-scheduled-cancel"
            >
              <X className="size-3.5" aria-hidden /> Cancel
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
