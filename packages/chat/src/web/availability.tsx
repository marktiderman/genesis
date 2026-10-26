/**
 * @feat:chat
 * Availability on the web: `ChatAwayBanner`, the line a thread shows when the other person is
 * away or outside their hours, and `ChatAvailabilitySettings`, where you set your own away
 * message, its end, your hours per weekday and your time zone.
 */
import { useEffect, useMemo, useState } from "react";
import { Moon } from "lucide-react";
import {
  Alert,
  AlertDescription,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Switch,
  Textarea,
  cn,
  toast,
} from "@marktiderman/genesis-ui";
import { WEEKDAYS, awayLine, awaySummary } from "../core/availability";
import type { ChatAvailability, Weekday, WorkingHours } from "../core/types";
import { useAvailability } from "../react/index";
import { toLocalInput } from "./schedule";

export interface ChatAwayBannerProps {
  /** One person (a direct conversation). */
  availability?: ChatAvailability | null;
  /** The person's name, as the app shows it. */
  name?: string;
  /** Several people (a group): everyone away or outside their hours is named, two at most. */
  people?: { availability: ChatAvailability | null | undefined; name: string }[];
  now?: Date;
  className?: string;
}

/** "Mark replies Mon–Fri, 9–5 (Eastern)", "Away until Monday: Back Monday", "Sam, Lee and 2 others are away"; nothing when everyone is around. */
export function ChatAwayBanner({ availability, name, people, now, className }: ChatAwayBannerProps) {
  const line = people ? awaySummary(people, { now }) : awayLine(availability, name ?? "They", { now });
  if (!line) return null;
  return (
    <Alert className={cn("rounded-none border-x-0 border-t-0 px-3 py-2", className)} role="status" data-testid="genesis-chat-away-banner">
      <Moon className="size-4" aria-hidden />
      <AlertDescription className="text-xs">{line}</AlertDescription>
    </Alert>
  );
}

const DAY_NAMES: Record<Weekday, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

const FALLBACK_ZONES = [
  "UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Toronto", "America/Sao_Paulo",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Africa/Johannesburg", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore",
  "Asia/Tokyo", "Australia/Sydney", "Pacific/Auckland",
];

function timeZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  try {
    const all = intl.supportedValuesOf?.("timeZone");
    if (all?.length) return all.includes("UTC") ? all : ["UTC", ...all];
  } catch {
    // older engines
  }
  return FALLBACK_ZONES;
}

const deviceZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

interface DayRow {
  on: boolean;
  from: string;
  to: string;
}

const defaultDays = (): Record<Weekday, DayRow> =>
  Object.fromEntries(WEEKDAYS.map((d) => [d, { on: d !== "sat" && d !== "sun", from: "09:00", to: "17:00" }])) as Record<Weekday, DayRow>;

function daysFrom(hours: WorkingHours | null | undefined): Record<Weekday, DayRow> {
  if (!hours) return defaultDays();
  return Object.fromEntries(
    WEEKDAYS.map((d) => {
      const first = hours[d]?.[0];
      return [d, first ? { on: true, from: first[0], to: first[1] } : { on: false, from: "09:00", to: "17:00" }];
    }),
  ) as Record<Weekday, DayRow>;
}

export interface ChatAvailabilitySettingsProps {
  /** Called after a save. */
  onSaved?: () => void;
  className?: string;
}

/**
 * Your availability: an away message (and until when), working hours per weekday, and the
 * time zone they're read in. One range per day here; extra ranges saved elsewhere are kept
 * for the days you don't change.
 */
export function ChatAvailabilitySettings({ onSaved, className }: ChatAvailabilitySettingsProps) {
  const { mine, mineLoading, setMine } = useAvailability();
  const zones = useMemo(timeZones, []);
  const [message, setMessage] = useState("");
  const [until, setUntil] = useState("");
  const [zone, setZone] = useState(deviceZone);
  const [useHours, setUseHours] = useState(false);
  const [days, setDays] = useState<Record<Weekday, DayRow>>(defaultDays);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mineLoading) return;
    setMessage(mine?.awayMessage ?? "");
    setUntil(mine?.awayUntil ? toLocalInput(new Date(mine.awayUntil)) : "");
    setZone(mine?.timeZone ?? deviceZone());
    setUseHours(Boolean(mine?.hours && Object.keys(mine.hours).length));
    setDays(daysFrom(mine?.hours));
  }, [mine, mineLoading]);

  if (mineLoading) {
    return (
      <div className={cn("flex flex-col gap-3", className)} aria-busy aria-label="Loading availability">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const badRange = useHours && WEEKDAYS.some((d) => days[d].on && days[d].from === days[d].to);

  const save = async () => {
    if (badRange) return;
    const hours: WorkingHours | null = useHours
      ? Object.fromEntries(
          WEEKDAYS.filter((d) => days[d].on).map((d) => {
            const kept = (mine?.hours?.[d] ?? []).slice(1);
            return [d, [[days[d].from, days[d].to] as [string, string], ...kept]];
          }),
        )
      : null;
    setBusy(true);
    try {
      await setMine({
        awayMessage: message.trim() || null,
        awayUntil: until ? new Date(until).toISOString() : null,
        timeZone: zone,
        hours,
      });
      toast.success("Availability saved");
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className={cn("flex flex-col gap-6", className)}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      data-testid="genesis-chat-availability-settings"
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">Away message</legend>
        <Label htmlFor="genesis-chat-away-message" className="sr-only">
          Away message
        </Label>
        <Textarea
          id="genesis-chat-away-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={280}
          placeholder="Back Monday. For anything urgent, call the office."
          className="min-h-20"
        />
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="genesis-chat-away-until" className="text-xs text-muted-foreground">
              Away until (optional)
            </Label>
            <Input id="genesis-chat-away-until" type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} className="w-56" />
          </div>
          {until || message ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setUntil("");
                setMessage("");
              }}
            >
              I'm back
            </Button>
          ) : null}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 flex w-full items-center justify-between gap-2 text-sm font-semibold">
          <span>Working hours</span>
        </legend>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="genesis-chat-use-hours" className="text-sm font-normal text-muted-foreground">
            Tell people when you usually reply
          </Label>
          <Switch id="genesis-chat-use-hours" checked={useHours} onCheckedChange={setUseHours} />
        </div>
        {useHours ? (
          <div className="flex flex-col gap-1.5" role="group" aria-label="Hours per day">
            {WEEKDAYS.map((d) => (
              <div key={d} className="flex flex-wrap items-center gap-2 text-sm" data-testid={`genesis-chat-hours-${d}`}>
                <Switch
                  checked={days[d].on}
                  onCheckedChange={(on) => setDays((x) => ({ ...x, [d]: { ...x[d], on } }))}
                  aria-label={`Working on ${DAY_NAMES[d]}`}
                />
                <span className={cn("w-24", !days[d].on && "text-muted-foreground")}>{DAY_NAMES[d]}</span>
                {days[d].on ? (
                  <>
                    <Input
                      type="time"
                      value={days[d].from}
                      onChange={(e) => setDays((x) => ({ ...x, [d]: { ...x[d], from: e.target.value } }))}
                      aria-label={`${DAY_NAMES[d]} from`}
                      className="h-8 w-28"
                    />
                    <span aria-hidden>–</span>
                    <Input
                      type="time"
                      value={days[d].to}
                      onChange={(e) => setDays((x) => ({ ...x, [d]: { ...x[d], to: e.target.value } }))}
                      aria-label={`${DAY_NAMES[d]} to`}
                      className="h-8 w-28"
                    />
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">Not working</span>
                )}
              </div>
            ))}
            {badRange ? (
              <p className="text-xs text-destructive" role="alert">
                A day's start and end can't be the same time.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">An end before the start runs past midnight.</p>
            )}
          </div>
        ) : null}
        <div className="flex flex-col gap-1">
          <Label htmlFor="genesis-chat-time-zone" className="text-xs text-muted-foreground">
            Time zone
          </Label>
          <Select value={zone} onValueChange={setZone}>
            <SelectTrigger id="genesis-chat-time-zone" className="w-72" aria-label="Time zone">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {(zones.includes(zone) ? zones : [zone, ...zones]).map((z) => (
                <SelectItem key={z} value={z}>
                  {z.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </fieldset>

      <div>
        <Button type="submit" loading={busy} disabled={badRange} data-testid="genesis-chat-availability-save">
          Save
        </Button>
      </div>
    </form>
  );
}
