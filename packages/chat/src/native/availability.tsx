/**
 * @feat:chat
 * Availability on native. `useAwayLine` and `ChatAwayLine`: the line a thread shows under its
 * header when the other person is away or outside their hours ("Mark replies Mon–Fri, 9–5
 * (Eastern)", "Away until Monday: Back Monday"; in a group, "Sam and Lee are away"), refreshed
 * each minute so it comes and goes with their hours. `ChatAvailabilityScreen`: your own away
 * message and its end, working hours per weekday and the time zone they're read in, for a
 * Settings route. The same rules as the web's `ChatAwayBanner` and `ChatAvailabilitySettings`.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { View } from "react-native";
import {
  NativeButton,
  NativeCombobox,
  NativeDatePicker,
  NativeIcon,
  NativeSkeleton,
  NativeSwitch,
  NativeText,
  NativeTextarea,
  NativeTimePicker,
  useToast,
} from "@marktiderman/genesis-ui-native/components";
import { SettingsSubPage } from "@marktiderman/genesis-ui-native/layouts";
import { useThemeRoles } from "@marktiderman/genesis-ui-native/hooks";
import { WEEKDAYS, awaySummary, minutesOf } from "../core/availability";
import type { AvailabilityInput, ChatAvailability, ChatMember, Weekday, WorkingHours } from "../core/types";
import { useAvailability } from "../react/index";
import { fill } from "./copy";
import { useChatNative } from "./context";
import { withDay, withTime } from "./schedule-sheet";

/** Ticks once a minute, so a line that depends on the clock keeps up with it. */
function useMinute(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/**
 * The away line for a conversation, or null when everyone is around: the other person in a
 * two-person conversation; in a group, everyone (but you) away or outside their hours.
 */
export function awayLineFor(
  members: readonly Pick<ChatMember, "userId" | "role">[],
  me: string,
  forUser: (userId: string) => ChatAvailability | null,
  nameOf: (userId: string) => string,
  now: Date = new Date(),
): string | null {
  const ids = members.filter((m) => m.userId !== me && m.role !== "observer").map((m) => m.userId);
  const people = ids.flatMap((id) => {
    const a = forUser(id);
    return a ? [{ availability: a, name: nameOf(id) }] : [];
  });
  return awaySummary(people, { now });
}

/** `awayLineFor` over the conversation's members, live (`useAvailability`), re-read each minute. */
export function useAwayLine(conversationId: string | null | undefined, members: readonly Pick<ChatMember, "userId" | "role">[], me: string, nameOf: (userId: string) => string): string | null {
  const { forUser, members: list } = useAvailability(conversationId);
  const now = useMinute();
  return useMemo(() => (list.length ? awayLineFor(members, me, forUser, nameOf, now) : null), [list, members, me, forUser, nameOf, now]);
}

export interface ChatAwayLineProps {
  text: string | null;
  testID?: string;
}

/** The away line, as a quiet strip under the header; nothing when `text` is null. */
export function ChatAwayLine({ text, testID = "chat-away-line" }: ChatAwayLineProps) {
  const colors = useThemeRoles();
  if (!text) return null;
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={text}
      accessibilityLiveRegion="polite"
      style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.fill }}
    >
      <NativeIcon name="clock" size={15} color={colors.secondaryLabel} />
      <NativeText preset="caption" style={{ flex: 1, color: colors.secondaryLabel }}>
        {text}
      </NativeText>
    </View>
  );
}

// ── Your availability ─────────────────────────────────────────────────────────

export interface DayHours {
  on: boolean;
  from: string;
  to: string;
}

export type WeekHours = Record<Weekday, DayHours>;

/** Monday to Friday, 9 to 5: where a first setup starts. */
export function defaultWeek(): WeekHours {
  return Object.fromEntries(WEEKDAYS.map((d) => [d, { on: d !== "sat" && d !== "sun", from: "09:00", to: "17:00" }])) as WeekHours;
}

/** Each day's first range from saved hours (a day with none is off). */
export function weekFromHours(hours: WorkingHours | null | undefined): WeekHours {
  if (!hours) return defaultWeek();
  return Object.fromEntries(
    WEEKDAYS.map((d) => {
      const first = hours[d]?.[0];
      return [d, first ? { on: true, from: first[0], to: first[1] } : { on: false, from: "09:00", to: "17:00" }];
    }),
  ) as WeekHours;
}

/** The hours to save: each day that's on, its range first, then any extra ranges saved elsewhere. */
export function hoursFromWeek(week: WeekHours, saved: WorkingHours | null | undefined): WorkingHours {
  return Object.fromEntries(
    WEEKDAYS.filter((d) => week[d].on).map((d) => [d, [[week[d].from, week[d].to] as [string, string], ...(saved?.[d] ?? []).slice(1)]]),
  );
}

/** A day that's on with the same start and end (the database refuses it). */
export function sameTimeDays(week: WeekHours): Weekday[] {
  return WEEKDAYS.filter((d) => week[d].on && week[d].from === week[d].to);
}

/** "09:30" as a Date today at that time (for a time picker), and back. */
export function clockToDate(hhmm: string, base: Date = new Date()): Date {
  const m = minutesOf(hhmm) ?? 9 * 60;
  const d = new Date(base);
  d.setHours(Math.floor(m / 60) % 24, m % 60, 0, 0);
  return d;
}
export function dateToClock(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export interface AvailabilityForm {
  message: string;
  until: Date | null;
  zone: string;
  useHours: boolean;
  week: WeekHours;
}

export function formFrom(mine: ChatAvailability | null, deviceZone: string): AvailabilityForm {
  return {
    message: mine?.awayMessage ?? "",
    until: mine?.awayUntil ? new Date(mine.awayUntil) : null,
    zone: mine?.timeZone ?? deviceZone,
    useHours: Boolean(mine?.hours && Object.keys(mine.hours).length),
    week: weekFromHours(mine?.hours),
  };
}

/** What `setAvailability` gets from the form. */
export function availabilityInput(form: AvailabilityForm, saved: ChatAvailability | null): AvailabilityInput {
  return {
    awayMessage: form.message.trim() || null,
    awayUntil: form.until ? form.until.toISOString() : null,
    timeZone: form.zone,
    hours: form.useHours ? hoursFromWeek(form.week, saved?.hours) : null,
  };
}

const FALLBACK_ZONES = [
  "UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Toronto", "America/Sao_Paulo",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Africa/Johannesburg", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore",
  "Asia/Tokyo", "Australia/Sydney", "Pacific/Auckland",
];

/** Every IANA zone the engine knows (Hermes has `Intl.supportedValuesOf`), else a short list. */
export function timeZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  try {
    const all = intl.supportedValuesOf?.("timeZone");
    if (all?.length) return all.includes("UTC") ? all : ["UTC", ...all];
  } catch {
    // an older engine
  }
  return FALLBACK_ZONES;
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

const DAY_NAMES: Record<Weekday, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

/** A weekday's name in the device's language (`mon` → "Monday"). */
function dayName(d: Weekday, locale?: string): string {
  // 2024-01-01 was a Monday.
  const date = new Date(2024, 0, 1 + WEEKDAYS.indexOf(d));
  try {
    return date.toLocaleDateString(locale, { weekday: "long" });
  } catch {
    return DAY_NAMES[d];
  }
}

export interface ChatAvailabilityScreenProps {
  /** Called after a save (go back, say). */
  onSaved?: () => void;
  testID?: string;
}

/**
 * Your availability, as a Settings sub-page: an away message and, optionally, until when;
 * working hours per weekday (one range a day here; extra ranges saved elsewhere are kept for
 * the days you don't turn off); the time zone they're read in. Save at the bottom.
 */
export function ChatAvailabilityScreen({ onSaved, testID = "chat-availability" }: ChatAvailabilityScreenProps) {
  const { copy } = useChatNative();
  const colors = useThemeRoles();
  const toast = useToast();
  const { mine, mineLoading, setMine } = useAvailability();
  const zones = useMemo(() => timeZones(), []);
  const [form, setForm] = useState<AvailabilityForm>(() => formFrom(null, deviceTimeZone()));
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mineLoading || loaded) return;
    setForm(formFrom(mine, deviceTimeZone()));
    setLoaded(true);
  }, [mine, mineLoading, loaded]);

  const zoneOptions = useMemo(() => {
    const list = zones.includes(form.zone) ? zones : [form.zone, ...zones];
    return list.map((z) => ({ value: z, label: z.replace(/_/g, " ") }));
  }, [zones, form.zone]);

  if (mineLoading || !loaded) {
    return (
      <SettingsSubPage testID={testID}>
        <View testID={`${testID}-loading`} style={{ gap: 12 }}>
          <NativeSkeleton height={88} className="w-full" />
          <NativeSkeleton height={220} className="w-full" />
        </View>
      </SettingsSubPage>
    );
  }

  const bad = form.useHours ? sameTimeDays(form.week) : [];
  const set = (patch: Partial<AvailabilityForm>) => setForm((f) => ({ ...f, ...patch }));
  const setDay = (d: Weekday, patch: Partial<DayHours>) => setForm((f) => ({ ...f, week: { ...f.week, [d]: { ...f.week[d], ...patch } } }));

  const save = async () => {
    if (bad.length) return;
    setBusy(true);
    try {
      await setMine(availabilityInput(form, mine));
      toast.show({ title: copy.availabilitySaved, variant: "success", duration: 1500 });
      onSaved?.();
    } catch (e) {
      toast.show({ title: e instanceof Error ? e.message : copy.actionFailed, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const tomorrow = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  };

  return (
    <SettingsSubPage testID={testID}>
      <View style={{ gap: 8 }}>
        <Section title={copy.awayMessage} />
        <NativeTextarea
          testID={`${testID}-message`}
          accessibilityLabel={copy.awayMessage}
          value={form.message}
          onChangeText={(message) => set({ message })}
          maxLength={280}
          placeholder={copy.awayMessagePlaceholder}
          rows={3}
        />
        <Row label={copy.awayUntilOn}>
          <NativeSwitch testID={`${testID}-until-on`} accessibilityLabel={copy.awayUntilOn} checked={form.until !== null} onCheckedChange={(on) => set({ until: on ? tomorrow() : null })} />
        </Row>
        {form.until ? (
          <Row label={copy.awayUntil}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <NativeDatePicker testID={`${testID}-until-date`} value={form.until} onChange={(d) => set({ until: withDay(form.until!, d) })} />
              <NativeTimePicker testID={`${testID}-until-time`} value={form.until} onChange={(d) => set({ until: withTime(form.until!, d) })} />
            </View>
          </Row>
        ) : null}
        {form.message || form.until ? (
          <View style={{ alignItems: "flex-start" }}>
            <NativeButton testID={`${testID}-back`} variant="ghost" onPress={() => set({ message: "", until: null })}>
              {copy.imBack}
            </NativeButton>
          </View>
        ) : null}
      </View>

      <View style={{ gap: 8 }}>
        <Section title={copy.workingHours} />
        <Row label={copy.workingHoursOn}>
          <NativeSwitch testID={`${testID}-hours-on`} accessibilityLabel={copy.workingHoursOn} checked={form.useHours} onCheckedChange={(useHours) => set({ useHours })} />
        </Row>
        {form.useHours ? (
          <View accessibilityLabel={copy.workingHours} style={{ gap: 4 }}>
            {WEEKDAYS.map((d) => {
              const name = dayName(d);
              const day = form.week[d];
              return (
                <View key={d} testID={`${testID}-day-${d}`} style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, minHeight: 44 }}>
                  <NativeSwitch testID={`${testID}-day-${d}-on`} accessibilityLabel={fill(copy.workingDay, { name })} checked={day.on} onCheckedChange={(on) => setDay(d, { on })} />
                  <NativeText preset="body" style={{ minWidth: 96, color: day.on ? colors.label : colors.secondaryLabel }}>
                    {name}
                  </NativeText>
                  {day.on ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <NativeTimePicker testID={`${testID}-day-${d}-from`} value={clockToDate(day.from)} onChange={(t) => setDay(d, { from: dateToClock(t) })} />
                      <NativeText accessibilityElementsHidden importantForAccessibility="no">–</NativeText>
                      <NativeTimePicker testID={`${testID}-day-${d}-to`} value={clockToDate(day.to)} onChange={(t) => setDay(d, { to: dateToClock(t) })} />
                    </View>
                  ) : (
                    <NativeText preset="caption" style={{ color: colors.secondaryLabel }}>
                      {copy.notWorking}
                    </NativeText>
                  )}
                </View>
              );
            })}
            <NativeText testID={`${testID}-hours-hint`} preset="caption" accessibilityLiveRegion="polite" style={{ color: bad.length ? colors.destructive : colors.secondaryLabel }}>
              {bad.length ? copy.hoursSameTime : copy.workingHoursHint}
            </NativeText>
          </View>
        ) : null}
      </View>

      <View style={{ gap: 8 }}>
        <Section title={copy.timeZone} />
        <NativeCombobox testID={`${testID}-zone`} options={zoneOptions} value={form.zone} onChange={(zone) => set({ zone })} placeholder={copy.timeZoneSearch} />
      </View>

      <NativeButton testID={`${testID}-save`} onPress={() => void save()} loading={busy} disabled={bad.length > 0}>
        {copy.availabilitySave}
      </NativeButton>
    </SettingsSubPage>
  );
}

function Section({ title }: { title: string }) {
  const colors = useThemeRoles();
  return (
    <NativeText preset="label" accessibilityRole="header" style={{ color: colors.secondaryLabel, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 8 }}>
      {title}
    </NativeText>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 44 }}>
      <NativeText preset="body" style={{ flexShrink: 1 }}>
        {label}
      </NativeText>
      {children}
    </View>
  );
}
