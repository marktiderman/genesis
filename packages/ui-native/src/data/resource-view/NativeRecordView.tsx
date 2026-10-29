// NativeRecordView: one record's screen from a genesis-core record view (defineRecordView),
// in native patterns:
//   - the title in the navigation bar and the actions in the header menu, through
//     `getNativeRecordViewStackOptions` (the host's <Stack.Screen options>), as SettingsPage does;
//   - up to four sections as a segmented control; more as pushed rows (`onOpenSection`);
//   - a list section → an embedded NativeResourceView of the child view, filtered by the row;
//   - a settings section → inset grouped settings rows, saving only its listed keys, a zero-row
//     save shown inline as a refusal;
//   - readiness → a summary chip, then the checks while any is unmet.
// A section with neither list nor settings is the screen's own, through `slots[id]`.

import { useMemo, useRef, useState, type ReactNode } from "react";
import { ActionSheetIOS, Alert, Platform, Pressable, ScrollView, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DataWriteError, resourceKeys, useCapabilities, useDataProvider, useViewer, type DataRow, type ResourceContract } from "@marktiderman/genesis-core";
import { readinessChip, type ReadinessLabels } from "@marktiderman/genesis-core/resource";
import type { Allowed, RecordView as RecordViewDef, RecordViewHeaderAction } from "@marktiderman/genesis-core/resource-view";
import { NativeBadge } from "../../components/badge";
import { NativeButton } from "../../components/button";
import { NativeIcon } from "../../components/icon";
import { NativeInlineAlert } from "../../components/inline-alert";
import { NativeInput } from "../../components/input";
import { NativeListItem } from "../../components/list-item";
import { NativeSegmentedControl } from "../../components/segmented-control";
import { NativeSheet } from "../../components/sheet";
import { NativeSelect, NativeSelectContent, NativeSelectItem, NativeSelectTrigger } from "../../components/select";
import { NativeSwitch } from "../../components/switch";
import { NativeText } from "../../components/text";
import { NativeTextarea } from "../../components/textarea";
import { useThemeRoles } from "../../hooks/use-theme-roles";
import { composeHeaderOptions, type ScreenHeaderProps } from "../../layouts/screen-container";
import { badgeVariant } from "./display";
import { formFieldsFor, refusalMessage, type NativeFormField } from "./mapping";
import { fill } from "./messages";
import { NativeResourceView, type NativeResourceViewProps } from "./NativeResourceView";

type Row = Record<string, unknown>;
type Values = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract; the row is what matters here
type AnyRecordView<T extends Row> = RecordViewDef<ResourceContract<any>, T & DataRow>;

/**
 * The words NativeRecordView shows. Override any of them with `messages`. The readiness
 * chip's keys (`ready`, `empty`, `pending`, `problems`, `warnings`) are genesis-core/resource's
 * `readinessChip` labels: unset, they use its defaults.
 */
export interface NativeRecordViewMessages extends ReadinessLabels {
  actions: string;
  cancel: string;
  save: string;
  /** `{noun}`: the record's noun. When a save changed no rows. */
  notChanged: string;
  failed: string;
  /** `{name}`: the action. When the provider can't run actions and the screen gave no `onAction`. */
  noRunner: string;
  checks: string;
  checkDone: string;
  checkTodo: string;
  /** The back row of a section opened from the list of sections. */
  allSections: string;
  notANumber: string;
}

export const defaultNativeRecordViewMessages: NativeRecordViewMessages = {
  actions: "Actions",
  cancel: "Cancel",
  save: "Save",
  notChanged: "This {noun} was not changed.",
  failed: "That didn't work. Try again.",
  noRunner: "{name} isn't available here.",
  checks: "Checks",
  checkDone: "Done",
  checkTodo: "To do",
  allSections: "All sections",
  notANumber: "Enter a number.",
  ready: undefined,
  empty: undefined,
  pending: undefined,
  problems: undefined,
  warnings: undefined,
};

/** Up to this many sections show as a segmented control; more are pushed rows. */
export const SEGMENTED_SECTIONS_MAX = 4;

// ── Header: title and menu ────────────────────────────────────────────

export interface NativeRecordViewHeaderProps<T extends Row = Row> {
  view: AnyRecordView<T>;
  row: T;
  /** Runs an allowed (and confirmed) action. Default: the provider's `runAction`. */
  onAction?: (name: string, row: T) => unknown;
  /** The screen's own rule: `false` hides an action, a sentence refuses it. Only narrows. */
  can?: (action: string, row: T) => Allowed | boolean;
  messages?: Partial<NativeRecordViewMessages>;
}

/** Runs header actions: guards explain, confirms ask, one at a time, failures in an alert. */
function useHeaderActions<T extends Row>({ view: recordView, row, onAction, can, messages }: NativeRecordViewHeaderProps<T>) {
  const words = { ...defaultNativeRecordViewMessages, ...messages };
  const provider = useDataProvider();
  const queryClient = useQueryClient();
  const view = recordView.view;
  // Actions show only where something can run them, and only those the provider serves when it says.
  const capabilities = useCapabilities(view.resource, { enabled: !onAction && !!provider.capabilities });
  const described = useQuery({
    queryKey: ["__describe", view.resource],
    queryFn: () => provider.describe!(view.resource),
    enabled: !onAction && !!provider.describe,
    staleTime: Infinity,
  });
  // The view's action guards read the viewer (ViewerScope's id, scope and roles).
  const viewer = useViewer();
  const actions = recordView.headerFor(row as T & DataRow, {
    viewer,
    runnable: Boolean(onAction) || (Boolean(provider.runAction) && capabilities.data?.actions !== false),
    ...(!onAction && described.data?.actions ? { served: described.data.actions.map((a) => a.name) } : {}),
    ...(can ? { can: (name: string) => can(name, row) } : {}),
  }).actions;
  // One action at a time: a second press while one runs does nothing.
  const running = useRef(false);
  const [pending, setPending] = useState(false);
  const run = async (a: RecordViewHeaderAction) => {
    if (running.current) return;
    running.current = true;
    setPending(true);
    try {
      if (onAction) await onAction(a.name, row);
      else if (provider.runAction) await provider.runAction(view.resource, { id: recordView.recordId(row as T & DataRow), action: a.name });
      else throw new DataWriteError("error", fill(words.noRunner, { name: a.label }));
      await queryClient.invalidateQueries({ queryKey: [...resourceKeys(view.resource).all] });
    } catch (error) {
      Alert.alert(a.label, refusalMessage(error, words.failed));
    } finally {
      running.current = false;
      setPending(false);
    }
  };
  const press = (a: RecordViewHeaderAction) => {
    if (running.current) return;
    if (a.allowed !== true) return Alert.alert(a.label, a.allowed);
    if (!a.confirm) return void run(a);
    // Two buttons: within Android's three (React Native docs, Alert).
    Alert.alert(a.confirm, a.description, [
      { text: words.cancel, style: "cancel" },
      { text: a.label, style: a.destructive ? "destructive" : "default", onPress: () => void run(a) },
    ]);
  };
  return { actions, press, pending, words };
}

/** Prefixes accessibility action names, so an action named "activate" never replaces the button's own. */
const A11Y_PREFIX = "action:";

/**
 * The header menu: a button that lists the record view's actions. On iOS an action sheet
 * (ActionSheetIOS, destructive ones in red); elsewhere a sheet of rows, since Android's alert
 * shows at most three buttons. A refused action stays listed and explains why when pressed.
 */
export function NativeRecordViewMenu<T extends Row = Row>(props: NativeRecordViewHeaderProps<T> & { testID?: string }) {
  const { testID = "native-resource-workspace-menu" } = props;
  const { actions, press, pending, words } = useHeaderActions(props);
  const [open, setOpen] = useState(false);
  if (actions.length === 0) return null;
  const labelOf = (a: RecordViewHeaderAction) => (a.allowed === true ? a.label : `${a.label} (${a.allowed})`);
  const show = () => {
    if (Platform.OS === "ios") {
      const destructive = actions.flatMap((a, i) => (a.destructive ? [i] : []));
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: props.view.headerFor(props.row as T & DataRow).title,
          options: [...actions.map(labelOf), words.cancel],
          cancelButtonIndex: actions.length,
          ...(destructive.length ? { destructiveButtonIndex: destructive } : {}),
        },
        (index) => {
          const a = actions[index];
          if (a) press(a);
        },
      );
    } else {
      setOpen(true);
    }
  };
  return (
    <>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={words.actions}
        accessibilityState={{ disabled: pending, busy: pending }}
        disabled={pending}
        accessibilityActions={actions.map((a) => ({ name: `${A11Y_PREFIX}${a.name}`, label: a.allowed === true ? a.label : `${a.label}: ${a.allowed}` }))}
        onAccessibilityAction={(event) => {
          const name = event.nativeEvent.actionName;
          const a = name.startsWith(A11Y_PREFIX) ? actions.find((x) => `${A11Y_PREFIX}${x.name}` === name) : undefined;
          if (a) press(a);
        }}
        onPress={show}
        hitSlop={8}
        className="min-h-[44px] min-w-[44px] items-center justify-center"
      >
        <NativeIcon name="more" label={words.actions} />
      </Pressable>
      <NativeSheet open={open} onOpenChange={setOpen} testID={`${testID}-sheet`}>
        <View style={{ paddingVertical: 8 }}>
          {actions.map((a) => (
            <Pressable
              key={a.name}
              testID={`${testID}-${a.name}`}
              accessibilityRole="button"
              accessibilityLabel={a.allowed === true ? a.label : `${a.label}: ${a.allowed}`}
              onPress={() => {
                setOpen(false);
                press(a);
              }}
              className="min-h-[48px] justify-center px-4"
            >
              <NativeText preset="body" className={a.destructive ? "text-destructive" : undefined}>
                {a.label}
              </NativeText>
              {a.allowed !== true ? (
                <NativeText preset="caption" className="text-muted-foreground">
                  {a.allowed}
                </NativeText>
              ) : null}
            </Pressable>
          ))}
          <Pressable testID={`${testID}-cancel`} accessibilityRole="button" onPress={() => setOpen(false)} className="min-h-[48px] justify-center px-4">
            <NativeText preset="body" className="text-muted-foreground">
              {words.cancel}
            </NativeText>
          </Pressable>
        </View>
      </NativeSheet>
    </>
  );
}

/**
 * `<Stack.Screen options>` for a record view: the record's title in the navigation bar and the
 * actions in the header menu.
 *
 * ```tsx
 * <Stack.Screen options={getNativeRecordViewStackOptions({ view: brandRecordView, row: brand })} />
 * ```
 */
export function getNativeRecordViewStackOptions<T extends Row>(
  props: NativeRecordViewHeaderProps<T> & Omit<ScreenHeaderProps, "headerTitle">,
): Record<string, unknown> {
  const { view: recordView, row, onAction, can, messages, ...header } = props;
  const menu = { view: recordView, row, ...(onAction ? { onAction } : {}), ...(can ? { can } : {}), ...(messages ? { messages } : {}) };
  return composeHeaderOptions({
    ...header,
    headerTitle: recordView.headerFor(row as T & DataRow).title,
    headerRight: header.headerRight ?? (recordView.headerActions.length ? () => <NativeRecordViewMenu {...menu} /> : undefined),
  });
}

// ── Screen ────────────────────────────────────────────────────────────

export interface NativeRecordViewProps<T extends Row = Row> {
  view: AnyRecordView<T>;
  /** The record, as the screen loaded it. A save refreshes it through the cache. */
  row: T;
  /**
   * The section to show. With up to four sections, the segmented control's value (default the
   * first). With more, the pushed section; without it, the list of sections.
   */
  section?: string;
  /** The segmented control changed section. */
  onSectionChange?: (id: string) => void;
  /**
   * With more than four sections: push that section's route (the pushed screen passes `section`).
   * Without it, the section opens in place with an "All sections" row to go back.
   */
  onOpenSection?: (id: string) => void;
  /** After a settings section saved, with the stored row. */
  onSaved?: (row: T) => void;
  /** Above the sections: a switcher between records. */
  switcher?: ReactNode;
  /** The screen's own sections, by id. */
  slots?: Partial<Record<string, ReactNode>>;
  /** More props for a list section's NativeResourceView, by section id. */
  lists?: Partial<Record<string, Partial<Omit<NativeResourceViewProps, "view" | "filter">>>>;
  messages?: Partial<NativeRecordViewMessages>;
  testID?: string;
}

/**
 * One record's screen, from its record view (defineRecordView):
 *
 * ```tsx
 * <Stack.Screen options={getNativeRecordViewStackOptions({ view: brandRecordView, row: brand })} />
 * <NativeRecordView view={brandRecordView} row={brand} />
 * ```
 */
export function NativeRecordView<T extends Row = Row>(props: NativeRecordViewProps<T>) {
  const { view: recordView, row, section, onSectionChange, onOpenSection, onSaved, switcher, slots, lists, messages, testID = "native-resource-workspace" } = props;
  const words = { ...defaultNativeRecordViewMessages, ...messages };
  const colors = useThemeRoles();
  const queryClient = useQueryClient();
  const record = row as T & DataRow;
  const sections = recordView.sections;
  const many = sections.length > SEGMENTED_SECTIONS_MAX;
  const [local, setLocal] = useState<string | undefined>(undefined);
  const activeId = section ?? local ?? (many ? undefined : sections[0]?.id);
  const active = activeId ? recordView.section(activeId) : undefined;
  const readiness = recordView.readinessFor(record);
  const summary = recordView.readinessSummary(record);
  const chip = summary ? readinessChip(summary, words) : null;

  const choose = (id: string) => {
    if (many && onOpenSection) return onOpenSection(id);
    setLocal(id);
    onSectionChange?.(id);
  };

  const top = (
    <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 12 }}>
      {switcher}
      {chip ? (
        <View style={{ flexDirection: "row" }}>
          <NativeBadge testID={`${testID}-readiness`} variant={badgeVariant(chip.tone)}>
            {chip.label}
          </NativeBadge>
        </View>
      ) : null}
      {readiness.some((r) => !r.ok) ? (
        <Group testID={`${testID}-checks`} title={words.checks}>
          {readiness.map((r, i) => (
            <Cell key={r.key} last={i === readiness.length - 1}>
              <NativeListItem
                testID={`${testID}-check-${i}`}
                title={r.title}
                subtitle={r.ok ? undefined : r.reason}
                className="bg-transparent"
                trailing={
                  <NativeBadge testID={`${testID}-check-${i}-chip`} variant={badgeVariant(r.tone)}>
                    {r.ok ? words.checkDone : words.checkTodo}
                  </NativeBadge>
                }
              />
            </Cell>
          ))}
        </Group>
      ) : null}
      {!many ? (
        <NativeSegmentedControl
          testID={`${testID}-sections`}
          options={sections.map((s) => ({ value: s.id, label: s.label }))}
          value={activeId ?? ""}
          onChange={choose}
        />
      ) : null}
    </View>
  );

  let body: ReactNode = null;
  if (many && !active) {
    body = (
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Group testID={`${testID}-sections`}>
          {sections.map((s, i) => (
            <Cell key={s.id} last={i === sections.length - 1}>
              <NativeListItem testID={`${testID}-section-${s.id}`} title={s.label} showChevron onPress={() => choose(s.id)} className="bg-transparent" />
            </Cell>
          ))}
        </Group>
      </ScrollView>
    );
  }
  // A section opened in place from the list of sections: a row back to the list.
  const back =
    many && local !== undefined && section === undefined ? (
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <Group testID={`${testID}-back`}>
          <Cell last>
            <NativeListItem
              testID={`${testID}-all-sections`}
              title={words.allSections}
              leading={<NativeIcon name="chevron-left" />}
              onPress={() => setLocal(undefined)}
              className="bg-transparent"
            />
          </Cell>
        </Group>
      </View>
    ) : null;
  if (active?.kind === "list") {
    body = (
      <NativeResourceView
        key={active.id}
        view={active.view}
        testID={`${testID}-list`}
        {...lists?.[active.id]}
        title={false}
        filter={recordView.listFilter(active.id, record)}
      />
    );
  } else if (active?.kind === "settings") {
    body = (
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <SettingsGroup
          // A fresh draft per record and section.
          key={`${String(recordView.recordId(record))}:${active.id}`}
          recordView={recordView}
          sectionId={active.id}
          row={record}
          words={words}
          onSaved={(saved) => {
            void queryClient.invalidateQueries({ queryKey: [...resourceKeys(recordView.view.resource).all] });
            onSaved?.(saved as T);
          }}
          testID={`${testID}-settings`}
        />
      </ScrollView>
    );
  } else if (active) {
    body = slots?.[active.id] ?? null;
  }

  return (
    <View testID={testID} style={{ flex: 1, backgroundColor: colors.groupedBackground }}>
      {top}
      {back}
      <View style={{ flex: 1 }}>{body}</View>
    </View>
  );
}

// ── Settings ──────────────────────────────────────────────────────────

function SettingsGroup({
  recordView,
  sectionId,
  row,
  words,
  onSaved,
  testID,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract
  recordView: RecordViewDef<ResourceContract<any>, any>;
  sectionId: string;
  row: DataRow;
  words: NativeRecordViewMessages;
  onSaved: (row: DataRow) => void;
  testID: string;
}) {
  const provider = useDataProvider();
  const view = recordView.view;
  // The view's edit-form mapping (the form sheet's), narrowed to this section's keys in their order.
  const fields = useMemo(() => {
    const byKey = new Map(formFieldsFor(view, "edit").map((f) => [f.key, f]));
    return recordView.settingsFields(sectionId).map((f) => byKey.get(f.field.name)).filter((f): f is NativeFormField => !!f && !f.readOnly);
  }, [recordView, view, sectionId]);
  // The view's update guard, for this viewer: when it refuses, the settings are read-only with its reason.
  const viewer = useViewer();
  const locked = recordView.settingsLocked(row, viewer);
  const [draft, setDraft] = useState<Values>(() => Object.fromEntries(fields.map((f) => [f.key, row[f.key]])));
  const [invalid, setInvalid] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const shown = fields.filter((f) => !f.visible || f.visible(draft));
  const changed: Values = {};
  for (const f of shown) if (draft[f.key] !== row[f.key]) changed[f.key] = draft[f.key];
  const dirty = Object.keys(changed).length > 0 && !shown.some((f) => invalid[f.key]);

  const set = (key: string, value: unknown, error?: string) => {
    setRefusal(null);
    setInvalid(({ [key]: _old, ...rest }) => (error ? { ...rest, [key]: error } : rest));
    setDraft((d) => ({ ...d, [key]: value }));
  };
  const save = async () => {
    setSaving(true);
    setRefusal(null);
    try {
      // Only the section's listed keys, never anything else the row or draft holds.
      const result = await provider.update(view.resource, { id: recordView.recordId(row), data: recordView.settingsPatch(sectionId, changed) });
      // A write that matched no rows is a refusal, never a silent success.
      if (!result || result.data === null || result.data === undefined) setRefusal(fill(words.notChanged, { noun: view.noun }));
      else onSaved(result.data as DataRow);
    } catch (error) {
      setRefusal(refusalMessage(error, words.failed));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      {refusal ? <NativeInlineAlert testID={`${testID}-refusal`} variant="destructive" description={refusal} /> : null}
      {locked !== null ? <NativeInlineAlert testID={`${testID}-locked`} variant="info" description={locked} /> : null}
      <Group testID={`${testID}-group`} title={recordView.section(sectionId)?.label}>
        {shown.map((f, i) => (
          <Cell key={f.key} last={i === shown.length - 1}>
            <SettingRow
              field={f}
              nullable={Boolean(view.field(f.key)?.nullable)}
              value={draft[f.key]}
              error={invalid[f.key]}
              disabled={locked !== null}
              words={words}
              onChange={(v, error) => set(f.key, v, error)}
              testID={`${testID}-${f.key}`}
            />
          </Cell>
        ))}
      </Group>
      {locked === null ? (
        <NativeButton testID={`${testID}-save`} disabled={!dirty || saving} loading={saving} onPress={() => void save()}>
          {words.save}
        </NativeButton>
      ) : null}
    </View>
  );
}

// The names before record views were called record views ("workspace" now means where the viewer
// is working: docs/adr/0004-workspaces.md). Kept for one minor release; `workspace` is now `view`.

type OldPage<P extends { view: unknown }> = Omit<P, "view"> & { workspace: P["view"] };

/** @deprecated Renamed `NativeRecordViewProps`; its `workspace` prop is now `view`. */
export type NativeResourceWorkspaceProps<T extends Row = Row> = OldPage<NativeRecordViewProps<T>>;

/** @deprecated Renamed `NativeRecordView`, with `view` in place of `workspace`. */
export function NativeResourceWorkspace<T extends Row = Row>({ workspace, ...props }: NativeResourceWorkspaceProps<T>) {
  return <NativeRecordView<T> {...props} view={workspace} />;
}

/** @deprecated Renamed `NativeRecordViewMenu`, with `view` in place of `workspace`. */
export function NativeResourceWorkspaceMenu<T extends Row = Row>({ workspace, ...props }: OldPage<NativeRecordViewHeaderProps<T>> & { testID?: string }) {
  return <NativeRecordViewMenu<T> {...props} view={workspace} />;
}

/** @deprecated Renamed `getNativeRecordViewStackOptions`, with `view` in place of `workspace`. */
export function getNativeResourceWorkspaceStackOptions<T extends Row>({
  workspace,
  ...props
}: OldPage<NativeRecordViewHeaderProps<T>> & Omit<ScreenHeaderProps, "headerTitle">): Record<string, unknown> {
  return getNativeRecordViewStackOptions<T>({ ...props, view: workspace });
}

/** @deprecated Renamed `NativeRecordViewHeaderProps`; its `workspace` prop is now `view`. */
export type NativeResourceWorkspaceHeaderProps<T extends Row = Row> = OldPage<NativeRecordViewHeaderProps<T>>;

/** @deprecated Renamed `NativeRecordViewMessages`. */
export type NativeResourceWorkspaceMessages = NativeRecordViewMessages;

/** @deprecated Renamed `defaultNativeRecordViewMessages`. */
export const defaultNativeResourceWorkspaceMessages = defaultNativeRecordViewMessages;

/**
 * A number as typed: "1.5" or, with a comma as the decimal mark, "1,5". Anything else (an empty
 * string aside) is an error, never NaN.
 */
export function parseSettingNumber(text: string): number | null {
  const t = text.trim();
  const normalised = /^-?\d+,\d+$/.test(t) ? t.replace(",", ".") : t;
  const n = normalised === "" ? Number.NaN : Number(normalised);
  return Number.isFinite(n) ? n : null;
}

function SettingRow({
  field: f,
  nullable,
  value,
  error,
  disabled,
  words,
  onChange,
  testID,
}: {
  field: NativeFormField;
  nullable: boolean;
  value: unknown;
  error?: string | undefined;
  disabled: boolean;
  words: NativeRecordViewMessages;
  onChange: (v: unknown, error?: string) => void;
  testID: string;
}) {
  // An emptied field is null when the column allows it, as on the web.
  const empty = nullable ? null : "";
  const [typed, setTyped] = useState(() => (value == null ? "" : String(value)));
  if (f.kind === "switch") {
    return (
      <NativeListItem
        testID={testID}
        title={f.label}
        className="bg-transparent"
        disabled={disabled}
        trailing={<NativeSwitch testID={`${testID}-input`} aria-label={f.label} checked={value === true} disabled={disabled} onCheckedChange={(v) => onChange(v)} />}
      />
    );
  }
  const text = value == null ? "" : String(value);
  let control: ReactNode;
  if (f.kind === "segmented") {
    control = <NativeSegmentedControl testID={`${testID}-input`} options={f.options ?? []} value={text} disabled={disabled} onChange={(v) => onChange(v)} />;
  } else if (f.kind === "select") {
    control = (
      <NativeSelect value={text} onValueChange={(v) => onChange(v)}>
        <NativeSelectTrigger testID={`${testID}-input`} placeholder={f.label} disabled={disabled} />
        <NativeSelectContent>
          {(f.options ?? []).map((o) => (
            <NativeSelectItem key={o.value} value={o.value}>
              {o.label}
            </NativeSelectItem>
          ))}
        </NativeSelectContent>
      </NativeSelect>
    );
  } else if (f.kind === "textarea") {
    control = (
      <NativeTextarea
        testID={`${testID}-input`}
        accessibilityLabel={f.label}
        editable={!disabled}
        value={text}
        maxLength={f.max}
        onChangeText={(t) => onChange(t === "" ? empty : t)}
      />
    );
  } else if (f.kind === "number") {
    control = (
      <NativeInput
        testID={`${testID}-input`}
        accessibilityLabel={f.label}
        editable={!disabled}
        value={typed}
        keyboardType="decimal-pad"
        error={error}
        onChangeText={(t) => {
          setTyped(t);
          if (t.trim() === "") return onChange(empty);
          const n = parseSettingNumber(t);
          return n === null ? onChange(t, words.notANumber) : onChange(n);
        }}
      />
    );
  } else {
    control = (
      <NativeInput
        testID={`${testID}-input`}
        accessibilityLabel={f.label}
        editable={!disabled}
        value={text}
        maxLength={f.max}
        autoCapitalize={f.kind === "text" ? "sentences" : "none"}
        keyboardType={f.kind === "email" ? "email-address" : f.kind === "url" ? "url" : "default"}
        onChangeText={(t) => onChange(t === "" ? empty : t)}
      />
    );
  }
  return (
    <View testID={testID} style={{ paddingHorizontal: 16, paddingVertical: 10, gap: 6, opacity: disabled ? 0.6 : 1 }}>
      <NativeText preset="body-sm" className="font-medium">
        {f.label}
      </NativeText>
      {control}
    </View>
  );
}

// ── Inset grouped pieces (SettingsPage's look) ────────────────────────

function Group({ title, children, testID }: { title?: string | undefined; children: ReactNode; testID: string }) {
  const colors = useThemeRoles();
  const ios = Platform.OS === "ios";
  return (
    <View testID={testID} style={{ gap: 6 }}>
      {title ? (
        <NativeText preset="caption" accessibilityRole="header" className={ios ? "uppercase text-muted-foreground px-4" : "text-primary px-4"}>
          {title}
        </NativeText>
      ) : null}
      <View style={{ backgroundColor: colors.surface, borderRadius: ios ? 10 : 0, overflow: "hidden" }}>{children}</View>
    </View>
  );
}

function Cell({ last, children }: { last: boolean; children: ReactNode }) {
  const colors = useThemeRoles();
  return (
    <View>
      {children}
      {!last ? <View style={{ height: 0.5, marginLeft: 16, backgroundColor: colors.separator }} /> : null}
    </View>
  );
}
