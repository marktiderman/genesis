/**
 * `<NotificationSettings>`: the notification preferences screen, a Genesis
 * `SettingsPage` with four parts:
 *
 *   permission   whether this phone may show notifications; Turn on / Open Settings
 *   categories   a switch per category the app defined
 *   quietHours   a switch, from and to times, and the time zone they're read in
 *   privacy      show previews (off: the sender sends neutral text instead)
 *
 * Each part is a slot (`slots.quietHours = MyQuietHours` replaces it inside
 * the same section, `null` drops the section) and a hook
 * (`useQuietHours()` …) for a screen of your own. Saving is immediate; a save
 * that fails is put back and said.
 */
import { useMemo, useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import type { SlotPropsFor, Slots } from "@marktiderman/genesis-core/slots";
import { NativeSwitch, NativeTimePicker } from "@marktiderman/genesis-ui-native/components";
import { SettingsPage, type SettingsPageProps, type SettingsPageRow, type SettingsPageSection } from "@marktiderman/genesis-ui-native/layouts";
import { usePush, useNotificationPreferences, usePushPermissionState, usePushRegistration } from "./block";
import type { PushPermissionStatus } from "./permission";
import { clockOf, dateAt, deviceTimeZone, isQuietAt } from "./quiet-hours";

export interface NotificationSettingsCopy {
  permissionSection: string;
  allow: string;
  status: Record<PushPermissionStatus, string>;
  turnOn: string;
  openSettings: string;
  noProjectId: string;
  noToken: string;
  registerFailed: string;
  categoriesSection: string;
  categoriesFootnote: string;
  quietHoursSection: string;
  quietHours: string;
  quietHoursOnNow: string;
  from: string;
  to: string;
  timeZone: string;
  useDeviceTimeZone: string;
  noTimeZone: string;
  quietHoursFootnote: string;
  privacySection: string;
  showPreviews: string;
  previewsFootnote: string;
  saveFailed: string;
}

export const notificationSettingsCopy: NotificationSettingsCopy = {
  permissionSection: "Notifications",
  allow: "Allow notifications",
  status: {
    unknown: "Checking…",
    undetermined: "Off",
    granted: "On",
    provisional: "Delivered quietly",
    denied: "Off in Settings",
    unavailable: "Not available on this device",
  },
  turnOn: "Turn on",
  openSettings: "Open Settings",
  noProjectId: "This build can't get notifications: it has no EAS project id.",
  noToken: "This phone didn't give the app a push token. Try again on a device with a network connection.",
  registerFailed: "Couldn't turn notifications on for this phone. They'll be tried again next time you open the app.",
  categoriesSection: "Notify me about",
  categoriesFootnote: "Applies to every phone you're signed in on.",
  quietHoursSection: "Quiet hours",
  quietHours: "Quiet hours",
  quietHoursOnNow: "On now",
  from: "From",
  to: "To",
  timeZone: "Time zone",
  useDeviceTimeZone: "Tap to use this phone's",
  noTimeZone: "This phone didn't say its time zone, so quiet hours can't be placed in your day.",
  quietHoursFootnote: "Notifications that arrive during quiet hours wait until they end. Urgent ones still come through.",
  privacySection: "Privacy",
  showPreviews: "Show previews",
  previewsFootnote: "When off, notifications say only that there's something new; what they say stays on the server, off your lock screen.",
  saveFailed: "Couldn't save that change. Check your connection and try again.",
};

/** The permission part's props: what `usePushPermission()` returns. */
export interface PermissionPartProps {
  status: PushPermissionStatus;
  requesting: boolean;
  /** Shows the system prompt (a tap is the person's intent, so no soft prompt first). */
  request: () => void;
  /** Opens the app's page in Settings, once the system won't ask again. */
  openSettings: (() => void) | null;
  /** Why this phone isn't registered, in the copy's words, or null. */
  problem: string | null;
  copy: NotificationSettingsCopy;
}

export interface CategoryRow {
  id: string;
  title: string;
  description?: string;
  on: boolean;
}

export interface CategoriesPartProps {
  categories: CategoryRow[];
  setOn: (id: string, on: boolean) => void;
  saving: boolean;
  copy: NotificationSettingsCopy;
}

export interface QuietHoursPartProps {
  enabled: boolean;
  start: string;
  end: string;
  timeZone: string | null;
  /** This phone's zone, when it differs from the saved one (it travelled). */
  deviceTimeZone: string | null;
  /** In quiet hours right now (shown only; the server decides). */
  activeNow: boolean;
  setEnabled: (on: boolean) => void;
  setStart: (clock: string) => void;
  setEnd: (clock: string) => void;
  adoptDeviceTimeZone: () => void;
  saving: boolean;
  copy: NotificationSettingsCopy;
}

export interface PrivacyPartProps {
  hidePreviews: boolean;
  setHidePreviews: (hide: boolean) => void;
  saving: boolean;
  copy: NotificationSettingsCopy;
}

// A type, not an interface, so it fits the slots contract's Record constraint.
export type NotificationSettingsSlots = {
  permission: PermissionPartProps;
  categories: CategoriesPartProps;
  quietHours: QuietHoursPartProps;
  privacy: PrivacyPartProps;
};

const DEFAULT_COPY = notificationSettingsCopy;

/** The permission part (rung 4). */
export function usePushPermission(copy: NotificationSettingsCopy = DEFAULT_COPY): PermissionPartProps {
  const block = usePush();
  const { status, requesting } = usePushPermissionState();
  const { problem } = usePushRegistration();
  const open = block.options.openSettings;
  return {
    status,
    requesting,
    request: () => void block.permission.request(),
    openSettings: open
      ? () => {
          Promise.resolve()
            .then(open)
            .catch((error: unknown) => block.options.onError?.(error instanceof Error ? error : new Error("openSettings failed"), "permission"));
        }
      : null,
    problem: problem === "no_project_id" ? copy.noProjectId : problem === "no_token" ? copy.noToken : problem === "backend" ? copy.registerFailed : null,
    copy,
  };
}

/** The categories part (rung 4). */
export function useNotificationCategories(copy: NotificationSettingsCopy = DEFAULT_COPY): CategoriesPartProps {
  const block = usePush();
  const { preferences, saving, update } = useNotificationPreferences();
  const categories = useMemo(
    () =>
      block.categories.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        on: typeof preferences.categories[c.id] === "boolean" ? preferences.categories[c.id]! : (c.defaultOn ?? true),
      })),
    [block.categories, preferences.categories],
  );
  return {
    categories,
    setOn: (id, on) => void update((p) => ({ ...p, categories: { ...p.categories, [id]: on } })),
    saving,
    copy,
  };
}

/** The quiet-hours part (rung 4). */
export function useQuietHours(copy: NotificationSettingsCopy = DEFAULT_COPY): QuietHoursPartProps {
  const { preferences, saving, update } = useNotificationPreferences();
  const q = preferences.quietHours;
  const device = deviceTimeZone();
  // Re-read each minute only while shown; the server is what decides.
  const minute = useMinute();
  const setQuiet = (change: Partial<typeof q>) => void update((p) => ({ ...p, quietHours: { ...p.quietHours, ...change } }));
  return {
    enabled: q.enabled,
    start: q.start,
    end: q.end,
    timeZone: q.timeZone,
    deviceTimeZone: device && device !== q.timeZone ? device : null,
    activeNow: isQuietAt(q, new Date(minute)),
    // Turning quiet hours on fills in this phone's zone if none was saved.
    setEnabled: (on) => setQuiet(on ? { enabled: true, timeZone: q.timeZone ?? device } : { enabled: false }),
    setStart: (start) => setQuiet({ start }),
    setEnd: (end) => setQuiet({ end }),
    adoptDeviceTimeZone: () => (device ? setQuiet({ timeZone: device }) : undefined),
    saving,
    copy,
  };
}

/** The privacy part (rung 4). */
export function usePrivacyPreviews(copy: NotificationSettingsCopy = DEFAULT_COPY): PrivacyPartProps {
  const { preferences, saving, update } = useNotificationPreferences();
  return {
    hidePreviews: preferences.hidePreviews,
    setHidePreviews: (hidePreviews) => void update((p) => ({ ...p, hidePreviews })),
    saving,
    copy,
  };
}

const minuteStore = {
  subscribe(listener: () => void) {
    const timer = setInterval(listener, 30_000);
    return () => clearInterval(timer);
  },
  get: () => Math.floor(Date.now() / 60_000) * 60_000,
};
function useMinute(): number {
  return useSyncExternalStore(minuteStore.subscribe, minuteStore.get, minuteStore.get);
}

function toggle(id: string, label: string, checked: boolean, onChange: (on: boolean) => void, disabled = false): ReactNode {
  return (
    <NativeSwitch
      testID={`notification-settings-${id}-switch`}
      accessibilityLabel={label}
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
    />
  );
}

/** The permission part's default rows. */
export function permissionRows(p: PermissionPartProps): SettingsPageRow[] {
  const { status, copy } = p;
  const row: SettingsPageRow = { id: "allow", title: copy.allow, subtitle: copy.status[status], testID: "notification-settings-allow" };
  if (status === "undetermined") {
    return [{ ...row, showChevron: true, onPress: p.requesting ? undefined : p.request, disabled: p.requesting, subtitle: `${copy.status.undetermined} · ${copy.turnOn}` }];
  }
  if (status === "denied" && p.openSettings) {
    return [{ ...row, showChevron: true, onPress: p.openSettings, subtitle: `${copy.status.denied} · ${copy.openSettings}` }];
  }
  return [row];
}

/** The categories part's default rows. */
export function categoryRows(p: CategoriesPartProps): SettingsPageRow[] {
  return p.categories.map((c) => ({
    id: `category-${c.id}`,
    title: c.title,
    subtitle: c.description,
    testID: `notification-settings-category-${c.id}`,
    trailing: toggle(`category-${c.id}`, c.title, c.on, (on) => p.setOn(c.id, on)),
  }));
}

/** The quiet-hours part's default rows. */
export function quietHoursRows(p: QuietHoursPartProps): SettingsPageRow[] {
  const { copy } = p;
  const rows: SettingsPageRow[] = [
    {
      id: "quiet-hours",
      title: copy.quietHours,
      subtitle: p.enabled && p.activeNow ? copy.quietHoursOnNow : undefined,
      testID: "notification-settings-quiet-hours",
      trailing: toggle("quiet-hours", copy.quietHours, p.enabled, p.setEnabled, !p.enabled && !p.timeZone && !p.deviceTimeZone),
    },
  ];
  if (!p.enabled) return rows;
  const picker = (id: string, label: string, value: string, set: (clock: string) => void) => (
    <NativeTimePicker testID={`notification-settings-${id}-time`} value={dateAt(value)} onChange={(d) => set(clockOf(d))} formatLabel={() => value} />
  );
  rows.push(
    { id: "quiet-from", title: copy.from, testID: "notification-settings-quiet-from", trailing: picker("quiet-from", copy.from, p.start, p.setStart) },
    { id: "quiet-to", title: copy.to, testID: "notification-settings-quiet-to", trailing: picker("quiet-to", copy.to, p.end, p.setEnd) },
    {
      id: "time-zone",
      title: copy.timeZone,
      subtitle: p.timeZone ? (p.deviceTimeZone ? `${p.timeZone} · ${copy.useDeviceTimeZone} (${p.deviceTimeZone})` : p.timeZone) : copy.noTimeZone,
      testID: "notification-settings-time-zone",
      ...(p.deviceTimeZone ? { onPress: p.adoptDeviceTimeZone, showChevron: true } : {}),
    },
  );
  return rows;
}

/** The privacy part's default rows. */
export function privacyRows(p: PrivacyPartProps): SettingsPageRow[] {
  return [
    {
      id: "previews",
      title: p.copy.showPreviews,
      testID: "notification-settings-previews",
      trailing: toggle("previews", p.copy.showPreviews, !p.hidePreviews, (show) => p.setHidePreviews(!show)),
    },
  ];
}

export interface NotificationSettingsProps {
  /** Your words: any of `notificationSettingsCopy`'s, replaced. */
  copy?: Partial<NotificationSettingsCopy>;
  /** Replace a part (rendered in its section) or drop its section (`null`). */
  slots?: Slots<NotificationSettingsSlots>;
  /** More props for a part, merged over what the screen passes. */
  slotProps?: SlotPropsFor<NotificationSettingsSlots>;
  /** Passed to SettingsPage (its own `slots` and `slotProps` reach rows and headers). */
  page?: Omit<SettingsPageProps, "sections" | "children">;
  /** Above the first section. */
  children?: ReactNode;
  testID?: string;
}

function section<P extends object>(
  id: string,
  title: string,
  footnote: string | undefined,
  props: P,
  rows: (props: P) => SettingsPageRow[],
  slot: ComponentType<P> | null | undefined,
  extra: Partial<P> | undefined,
): SettingsPageSection | null {
  if (slot === null) return null;
  const merged = { ...props, ...extra } as P;
  if (slot) {
    const Part = slot;
    return { id, title, footnote, rows: [], children: <Part {...merged} /> };
  }
  return { id, title, footnote, rows: rows(merged) };
}

/** The notification preferences screen. Needs the push block (GenesisNativeApp's `push`). */
export function NotificationSettings({ copy: overrides, slots = {}, slotProps = {}, page, children, testID = "notification-settings" }: NotificationSettingsProps) {
  const copy = useMemo(() => ({ ...DEFAULT_COPY, ...overrides, status: { ...DEFAULT_COPY.status, ...overrides?.status } }), [overrides]);
  const block = usePush();
  const permission = usePushPermission(copy);
  const categories = useNotificationCategories(copy);
  const quietHours = useQuietHours(copy);
  const privacy = usePrivacyPreviews(copy);
  const { error } = useNotificationPreferences();

  const sections = [
    section("permission", copy.permissionSection, permission.problem ?? (error ? copy.saveFailed : undefined), permission, permissionRows, slots.permission, slotProps.permission),
    block.categories.length > 0
      ? section("categories", copy.categoriesSection, copy.categoriesFootnote, categories, categoryRows, slots.categories, slotProps.categories)
      : null,
    section("quiet-hours", copy.quietHoursSection, copy.quietHoursFootnote, quietHours, quietHoursRows, slots.quietHours, slotProps.quietHours),
    section("privacy", copy.privacySection, copy.previewsFootnote, privacy, privacyRows, slots.privacy, slotProps.privacy),
  ].filter((s): s is SettingsPageSection => s !== null);

  return (
    <SettingsPage testID={testID} {...page} sections={sections}>
      {children}
    </SettingsPage>
  );
}
