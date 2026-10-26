// NativeResourceWorkspace: one record's screen from a genesis-core workspace (defineWorkspace),
// in native patterns:
//   - the title in the navigation bar and the actions in the header menu, through
//     `getNativeResourceWorkspaceStackOptions` (the host's <Stack.Screen options>), as SettingsPage does;
//   - up to four sections as a segmented control; more as pushed rows (`onOpenSection`);
//   - a list section → an embedded NativeResourceView of the child view, filtered by the row;
//   - a settings section → inset grouped settings rows, saving only its listed keys, a zero-row
//     save shown inline as a refusal;
//   - readiness → a group of checks, each with its chip tone.
// A section with neither list nor settings is the screen's own, through `slots[id]`.

import { useMemo, useState, type ReactNode } from "react";
import { Alert, Platform, Pressable, ScrollView, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { DataWriteError, resourceKeys, useDataProvider, type DataRow, type ResourceContract } from "@marktiderman/genesis-core";
import type { ResourceWorkspace as Workspace, WorkspaceHeaderAction } from "@marktiderman/genesis-core/resource-view";
import { NativeBadge } from "../../components/badge";
import { NativeButton } from "../../components/button";
import { NativeIcon } from "../../components/icon";
import { NativeInlineAlert } from "../../components/inline-alert";
import { NativeInput } from "../../components/input";
import { NativeListItem } from "../../components/list-item";
import { NativeSegmentedControl } from "../../components/segmented-control";
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
type AnyWorkspace<T extends Row> = Workspace<ResourceContract<any>, T & DataRow>;

/** The words NativeResourceWorkspace shows. Override any of them with `messages`. */
export const defaultNativeResourceWorkspaceMessages = {
  actions: "Actions",
  cancel: "Cancel",
  save: "Save",
  /** `{noun}`: the record's noun. When a save changed no rows. */
  notChanged: "This {noun} was not changed.",
  failed: "That didn't work. Try again.",
  /** `{name}`: the action. When the provider can't run actions and the screen gave no `onAction`. */
  noRunner: "{name} isn't available here.",
  checks: "Checks",
  checkDone: "Done",
  checkTodo: "To do",
};
export type NativeResourceWorkspaceMessages = typeof defaultNativeResourceWorkspaceMessages;

/** Up to this many sections show as a segmented control; more are pushed rows. */
export const SEGMENTED_SECTIONS_MAX = 4;

// ── Header: title and menu ────────────────────────────────────────────

export interface NativeResourceWorkspaceHeaderProps<T extends Row = Row> {
  workspace: AnyWorkspace<T>;
  row: T;
  /** Runs an allowed (and confirmed) action. Default: the provider's `runAction`. */
  onAction?: (name: string, row: T) => unknown;
  messages?: Partial<NativeResourceWorkspaceMessages>;
}

/** Runs header actions: guards explain, confirms ask, failures show in an alert. */
function useHeaderActions<T extends Row>({ workspace, row, onAction, messages }: NativeResourceWorkspaceHeaderProps<T>) {
  const words = { ...defaultNativeResourceWorkspaceMessages, ...messages };
  const provider = useDataProvider();
  const queryClient = useQueryClient();
  const view = workspace.view;
  const run = async (a: WorkspaceHeaderAction) => {
    try {
      if (onAction) await onAction(a.name, row);
      else if (provider.runAction) await provider.runAction(view.resource, { id: (row as DataRow).id as string, action: a.name });
      else throw new DataWriteError("error", fill(words.noRunner, { name: a.label }));
      await queryClient.invalidateQueries({ queryKey: [...resourceKeys(view.resource).all] });
    } catch (error) {
      Alert.alert(a.label, refusalMessage(error, words.failed));
    }
  };
  const press = (a: WorkspaceHeaderAction) => {
    if (a.allowed !== true) return Alert.alert(a.label, a.allowed);
    if (!a.confirm) return void run(a);
    Alert.alert(a.confirm, a.description, [
      { text: words.cancel, style: "cancel" },
      { text: a.label, onPress: () => void run(a) },
    ]);
  };
  return { actions: workspace.headerFor(row as T & DataRow).actions, press, words };
}

/**
 * The header menu: a button that lists the workspace's actions. A refused action stays listed
 * and explains why when pressed. For the navigation bar's `headerRight`.
 */
export function NativeResourceWorkspaceMenu<T extends Row = Row>(props: NativeResourceWorkspaceHeaderProps<T> & { testID?: string }) {
  const { testID = "native-resource-workspace-menu" } = props;
  const { actions, press, words } = useHeaderActions(props);
  if (actions.length === 0) return null;
  const open = () =>
    Alert.alert(props.workspace.headerFor(props.row as T & DataRow).title, undefined, [
      ...actions.map((a) => ({
        text: a.allowed === true ? a.label : `${a.label} (${a.allowed})`,
        onPress: () => press(a),
      })),
      { text: words.cancel, style: "cancel" as const },
    ]);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={words.actions}
      accessibilityActions={actions.map((a) => ({ name: a.name, label: a.allowed === true ? a.label : `${a.label}: ${a.allowed}` }))}
      onAccessibilityAction={(event) => {
        const a = actions.find((x) => x.name === event.nativeEvent.actionName);
        if (a) press(a);
      }}
      onPress={open}
      hitSlop={8}
      className="min-h-[44px] min-w-[44px] items-center justify-center"
    >
      <NativeIcon name="more" label={words.actions} />
    </Pressable>
  );
}

/**
 * `<Stack.Screen options>` for a workspace: the record's title in the navigation bar and the
 * actions in the header menu.
 *
 * ```tsx
 * <Stack.Screen options={getNativeResourceWorkspaceStackOptions({ workspace: brandWorkspace, row: brand })} />
 * ```
 */
export function getNativeResourceWorkspaceStackOptions<T extends Row>(
  props: NativeResourceWorkspaceHeaderProps<T> & Omit<ScreenHeaderProps, "headerTitle">,
): Record<string, unknown> {
  const { workspace, row, onAction, messages, ...header } = props;
  const menu = { workspace, row, ...(onAction ? { onAction } : {}), ...(messages ? { messages } : {}) };
  return composeHeaderOptions({
    ...header,
    headerTitle: workspace.headerFor(row as T & DataRow).title,
    headerRight: header.headerRight ?? (workspace.headerActions.length ? () => <NativeResourceWorkspaceMenu {...menu} /> : undefined),
  });
}

// ── Screen ────────────────────────────────────────────────────────────

export interface NativeResourceWorkspaceProps<T extends Row = Row> {
  workspace: AnyWorkspace<T>;
  /** The record, as the screen loaded it. A save refreshes it through the cache. */
  row: T;
  /**
   * The section to show. With up to four sections, the segmented control's value (default the
   * first). With more, the pushed section; without it, the list of sections.
   */
  section?: string;
  /** The segmented control changed section. */
  onSectionChange?: (id: string) => void;
  /** With more than four sections: push that section's route. */
  onOpenSection?: (id: string) => void;
  /** After a settings section saved, with the stored row. */
  onSaved?: (row: T) => void;
  /** Above the sections: a switcher between records. */
  switcher?: ReactNode;
  /** The screen's own sections, by id. */
  slots?: Partial<Record<string, ReactNode>>;
  /** More props for a list section's NativeResourceView, by section id. */
  lists?: Partial<Record<string, Partial<Omit<NativeResourceViewProps, "view" | "filter">>>>;
  messages?: Partial<NativeResourceWorkspaceMessages>;
  testID?: string;
}

/**
 * One record's screen from a workspace:
 *
 * ```tsx
 * <Stack.Screen options={getNativeResourceWorkspaceStackOptions({ workspace: brandWorkspace, row: brand })} />
 * <NativeResourceWorkspace workspace={brandWorkspace} row={brand} />
 * ```
 */
export function NativeResourceWorkspace<T extends Row = Row>(props: NativeResourceWorkspaceProps<T>) {
  const { workspace, row, section, onSectionChange, onOpenSection, onSaved, switcher, slots, lists, messages, testID = "native-resource-workspace" } = props;
  const words = { ...defaultNativeResourceWorkspaceMessages, ...messages };
  const colors = useThemeRoles();
  const queryClient = useQueryClient();
  const record = row as T & DataRow;
  const sections = workspace.sections;
  const many = sections.length > SEGMENTED_SECTIONS_MAX;
  const [local, setLocal] = useState<string | undefined>(undefined);
  const activeId = section ?? local ?? (many ? undefined : sections[0]?.id);
  const active = activeId ? workspace.section(activeId) : undefined;
  const readiness = workspace.readinessFor(record);

  const choose = (id: string) => {
    if (many && onOpenSection) return onOpenSection(id);
    setLocal(id);
    onSectionChange?.(id);
  };

  const top = (
    <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 12 }}>
      {switcher}
      {readiness.length ? (
        <Group testID={`${testID}-checks`} title={words.checks}>
          {readiness.map((r, i) => (
            <Cell key={r.title} last={i === readiness.length - 1}>
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
  } else if (active?.kind === "list") {
    body = (
      <NativeResourceView
        key={active.id}
        view={active.view}
        title={false}
        filter={workspace.listFilter(active.id, record)}
        testID={`${testID}-list`}
        {...lists?.[active.id]}
      />
    );
  } else if (active?.kind === "settings") {
    body = (
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <SettingsGroup
          // A fresh draft per record and section.
          key={`${String(record.id)}:${active.id}`}
          workspace={workspace}
          sectionId={active.id}
          row={record}
          words={words}
          onSaved={(saved) => {
            void queryClient.invalidateQueries({ queryKey: [...resourceKeys(workspace.view.resource).all] });
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
      <View style={{ flex: 1 }}>{body}</View>
    </View>
  );
}

// ── Settings ──────────────────────────────────────────────────────────

function SettingsGroup({
  workspace,
  sectionId,
  row,
  words,
  onSaved,
  testID,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract
  workspace: Workspace<ResourceContract<any>, any>;
  sectionId: string;
  row: DataRow;
  words: NativeResourceWorkspaceMessages;
  onSaved: (row: DataRow) => void;
  testID: string;
}) {
  const provider = useDataProvider();
  const view = workspace.view;
  // The view's edit-form mapping (the form sheet's), narrowed to this section's keys in their order.
  const fields = useMemo(() => {
    const byKey = new Map(formFieldsFor(view, "edit").map((f) => [f.key, f]));
    return workspace.settingsFields(sectionId).map((f) => byKey.get(f.field.name)).filter((f): f is NativeFormField => !!f && !f.readOnly);
  }, [workspace, view, sectionId]);
  const [draft, setDraft] = useState<Values>(() => Object.fromEntries(fields.map((f) => [f.key, row[f.key]])));
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const shown = fields.filter((f) => !f.visible || f.visible(draft));
  const changed: Values = {};
  for (const f of shown) if (draft[f.key] !== row[f.key]) changed[f.key] = draft[f.key];
  const dirty = Object.keys(changed).length > 0;

  const set = (key: string, value: unknown) => {
    setRefusal(null);
    setDraft((d) => ({ ...d, [key]: value }));
  };
  const save = async () => {
    setSaving(true);
    setRefusal(null);
    try {
      // Only the section's listed keys, never anything else the row or draft holds.
      const result = await provider.update(view.resource, { id: row.id as string, data: workspace.settingsPatch(sectionId, changed) });
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
      <Group testID={`${testID}-group`} title={workspace.section(sectionId)?.label}>
        {shown.map((f, i) => (
          <Cell key={f.key} last={i === shown.length - 1}>
            <SettingRow field={f} value={draft[f.key]} onChange={(v) => set(f.key, v)} testID={`${testID}-${f.key}`} />
          </Cell>
        ))}
      </Group>
      <NativeButton testID={`${testID}-save`} disabled={!dirty || saving} loading={saving} onPress={() => void save()}>
        {words.save}
      </NativeButton>
    </View>
  );
}

function SettingRow({ field: f, value, onChange, testID }: { field: NativeFormField; value: unknown; onChange: (v: unknown) => void; testID: string }) {
  const empty = f.required ? "" : null;
  if (f.kind === "switch") {
    return (
      <NativeListItem
        testID={testID}
        title={f.label}
        className="bg-transparent"
        trailing={<NativeSwitch testID={`${testID}-input`} aria-label={f.label} checked={value === true} onCheckedChange={onChange} />}
      />
    );
  }
  const text = value == null ? "" : String(value);
  let control: ReactNode;
  if (f.kind === "segmented") {
    control = <NativeSegmentedControl testID={`${testID}-input`} options={f.options ?? []} value={text} onChange={onChange} />;
  } else if (f.kind === "select") {
    control = (
      <NativeSelect value={text} onValueChange={onChange}>
        <NativeSelectTrigger testID={`${testID}-input`} placeholder={f.label} />
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
    control = <NativeTextarea testID={`${testID}-input`} accessibilityLabel={f.label} value={text} maxLength={f.max} onChangeText={(t) => onChange(t === "" ? empty : t)} />;
  } else {
    control = (
      <NativeInput
        testID={`${testID}-input`}
        accessibilityLabel={f.label}
        value={text}
        maxLength={f.max}
        autoCapitalize={f.kind === "text" ? "sentences" : "none"}
        keyboardType={f.kind === "number" ? "numeric" : f.kind === "email" ? "email-address" : f.kind === "url" ? "url" : "default"}
        onChangeText={(t) => onChange(t === "" ? empty : f.kind === "number" ? Number(t) : t)}
      />
    );
  }
  return (
    <View testID={testID} style={{ paddingHorizontal: 16, paddingVertical: 10, gap: 6 }}>
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
