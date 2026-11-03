// RecordView: one record's screen from a genesis-core record view (defineRecordView). It is
// the record view's existing parts, put together from the view:
//   - the header (summary, actions with their guards, a switcher) → ResourceHeader in AppShellPageHeader;
//   - sections → the shell's tabs through useAppShellSubNav, the active one drawn below;
//   - a list section → an embedded ResourceView of the child view, filtered by this record;
//   - a settings section → SettingsRow and ToggleRow in a SettingsSection, saving only the fields edited;
//   - readiness → ReadinessChip (readinessChip's words) in the tab row's end slot.
// A section with neither list nor settings is the screen's own, through `slots[id]`.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DataWriteError, isDataWriteError, resourceKeys, useCapabilities, useDataProvider, useResource, useViewer, useWrite, writeConflict, type BaseRecord, type DataRow, type ResourceContract, type WriteConflict } from "@marktiderman/genesis-core";
import { sameFormValue, type Allowed, type ResolvedFormField, type RecordView as RecordViewDef, type RecordViewHeaderAction } from "@marktiderman/genesis-core/resource-view";
import { fillMessage, useUiMessages } from "../../../messages";
import { AppShellPageHeader, AppShellSubNavEnd, useAppShellSubNav } from "../../layout/sub-nav";
import { SettingsRow } from "../../patterns/settings-row";
import { ToggleRow } from "../../patterns/toggle-row";
import { Chip } from "../../resource/chip";
import { ReadinessChip } from "../../resource/ReadinessChip";
import { ResourceHeader } from "../../resource/ResourceHeader";
import { SettingsSection } from "../../resource/ResourceSettingsPage";
import type { ReadinessLabels } from "@marktiderman/genesis-core/resource";
import { Alert, AlertDescription } from "../../ui/alert";
import { ConflictSheet } from "../ConflictSheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../ui/alert-dialog";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Textarea } from "../../ui/textarea";
import type { LucideIcon } from "lucide-react";
import { NONE_CHOICE as NONE } from "../none-choice";
import { inputHints } from "../ResourceFormField";
import { formType, ResourceView, type ResourceViewProps } from "./ResourceView";

type Row = Record<string, unknown>;
type Values = Record<string, unknown>;

export interface RecordViewProps<T extends Row = Row> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract; Row is what matters here
  view: RecordViewDef<ResourceContract<any>, T & DataRow>;
  /** The record, as the screen loaded it (`useOne`). A save refreshes it through the cache. */
  row: T;
  /** The section showing now: the route's segment. */
  section: string;
  /** Each section's route, for the shell's tabs: `(id) => \`/brands/${brand.id}/${id}\``. */
  sectionHref: (id: string) => string;
  /**
   * Runs a header action once allowed (and confirmed). Default: the provider's `runAction`. A
   * rejection shows inline.
   */
  onAction?: (name: string, row: T) => unknown;
  /**
   * The screen's own rule for a header action. It only narrows the view's guards: `false` hides
   * the action, a sentence refuses it with that reason.
   */
  can?: (action: string, row: T) => Allowed | boolean;
  /** After a settings section saved, with the stored row. */
  onSaved?: (row: T) => void;
  /** The breadcrumb's parent link: one element, so the host's router renders it. */
  parent?: ReactNode;
  /** In the header's leading area, before the title: a switcher between records. */
  switcher?: ReactNode;
  /** The screen's own sections, by id (sections with neither list nor settings). */
  slots?: Partial<Record<string, ReactNode>>;
  /** More props for a list section's ResourceView, by section id. */
  lists?: Partial<Record<string, Partial<Omit<ResourceViewProps, "view" | "filter">>>>;
  /** The readiness chip's words. */
  readinessLabels?: ReadinessLabels;
  /**
   * Why a settings section is read-only for this viewer, when the screen knows more than the
   * view's guards (a role the viewer lacks): the reason, or null. It only narrows: a section the
   * view's update guard locks stays locked.
   */
  settingsLocked?: ((sectionId: string, row: T) => string | null) | undefined;
  /**
   * Each section's icon, by section id, for the shell's tabs and the phone's bottom bar (which
   * otherwise shows the label's first letter).
   */
  sectionIcons?: Partial<Record<string, LucideIcon>> | undefined;
  testID?: string | undefined;
}

/** The settings save shows its own failures (inline, or in the conflict sheet), so useResource doesn't log them too. */
const alreadyShown = () => {};

/**
 * One record's screen, from its record view (defineRecordView):
 *
 * ```tsx
 * <RecordView view={brandRecordView} row={brand} section={tab} sectionHref={(id) => `/brands/${brand.id}/${id}`} />
 * ```
 */
export function RecordView<T extends Row = Row>(props: RecordViewProps<T>) {
  const { view: recordView, row, section, sectionHref, onAction, can, onSaved, parent, switcher, slots, lists, readinessLabels, sectionIcons, settingsLocked, testID = "resource-workspace" } = props;
  const record = row as T & DataRow;
  const m = useUiMessages();
  const provider = useDataProvider();
  const queryClient = useQueryClient();
  const view = recordView.view;
  const id = recordView.recordId(record);
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
  const header = recordView.headerFor(record, {
    viewer,
    runnable: Boolean(onAction) || (Boolean(provider.runAction) && capabilities.data?.actions !== false),
    ...(!onAction && described.data?.actions ? { served: described.data.actions.map((a) => a.name) } : {}),
    ...(can ? { can: (name: string) => can(name, row) } : {}),
  });
  const readiness = recordView.readinessFor(record);
  const [showChecks, setShowChecks] = useState(false);
  const [confirming, setConfirming] = useState<RecordViewHeaderAction | null>(null);

  useAppShellSubNav(
    recordView.sections.map((s) => {
      const icon = sectionIcons?.[s.id];
      return { to: sectionHref(s.id), label: s.label, ...(icon ? { icon } : {}) };
    }),
  );

  const action = useWrite(
    async (a: RecordViewHeaderAction) => {
      if (onAction) return onAction(a.name, row);
      if (!provider.runAction) throw new DataWriteError("error", fillMessage(m.workspace.noRunner, { name: a.label }));
      return provider.runAction(view.resource, { id, action: a.name });
    },
    { invalidates: [resourceKeys(view.resource).all] },
  );
  const start = (a: RecordViewHeaderAction) => {
    if (a.allowed !== true) return;
    if (a.confirm) setConfirming(a);
    else void action.fire(a);
  };

  const summary = recordView.readinessSummary(record);
  const active = recordView.section(section);

  return (
    <div data-testid={testID} className="space-y-4">
      <AppShellPageHeader>
        <ResourceHeader
          title={header.title}
          parent={parent}
          leading={switcher}
          {...(header.chips[0] ? { status: { label: header.chips[0].label, tone: header.chips[0].tone ?? "muted" } } : {})}
          // The first chip is the status; the rest follow it, and the summary's subtitle sits under the title.
          {...(header.chips.length > 1 ? { chips: header.chips.slice(1).map((c) => ({ label: c.label, tone: c.tone ?? "muted" })) } : {})}
          {...(header.subtitle ? { subtitle: header.subtitle } : {})}
          actions={header.actions.map((a) => (
            <Button
              key={a.name}
              variant={a.destructive ? "destructive" : "outline"}
              disabled={a.allowed !== true || action.pending}
              title={a.allowed === true ? a.description : a.allowed}
              onClick={() => start(a)}
              data-testid={`${testID}-action-${a.name}`}
            >
              {a.label}
            </Button>
          ))}
        />
      </AppShellPageHeader>
      {summary ? (
        <AppShellSubNavEnd>
          <ReadinessChip readiness={summary} labels={readinessLabels} onClick={() => setShowChecks((v) => !v)} />
        </AppShellSubNavEnd>
      ) : null}

      {action.error ? (
        <Alert variant="destructive" data-testid={`${testID}-action-error`}>
          <AlertDescription>{action.error}</AlertDescription>
        </Alert>
      ) : null}

      {showChecks && readiness.length ? (
        <SettingsSection title={m.workspace.checks}>
          {readiness.map((r) => (
            <SettingsRow key={r.key} label={r.title} description={r.ok ? undefined : r.reason}>
              <Chip tone={r.tone} testID={`${testID}-check-${r.ok ? "ok" : "todo"}`}>
                {r.ok ? m.workspace.checkDone : m.workspace.checkTodo}
              </Chip>
            </SettingsRow>
          ))}
        </SettingsSection>
      ) : null}

      {active?.kind === "list" ? (
        <ResourceView
          key={active.id}
          view={active.view}
          {...lists?.[active.id]}
          layout="embedded"
          filter={recordView.listFilter(active.id, record)}
        />
      ) : active?.kind === "settings" ? (
        <SettingsForm
          // A fresh draft per record and section (react.dev, "Resetting state with a key").
          key={`${String(id)}:${active.id}`}
          recordView={recordView}
          sectionId={active.id}
          title={active.label}
          row={record}
          screenLocked={settingsLocked?.(active.id, record) ?? null}
          onSaved={(saved) => {
            void queryClient.invalidateQueries({ queryKey: [...resourceKeys(view.resource).all] });
            onSaved?.(saved as T);
          }}
          testID={`${testID}-settings`}
        />
      ) : active ? (
        (slots?.[active.id] ?? null)
      ) : null}

      <AlertDialog open={confirming !== null} onOpenChange={(open) => (open ? undefined : setConfirming(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirming?.confirm}</AlertDialogTitle>
            {confirming?.description ? <AlertDialogDescription>{confirming.description}</AlertDialogDescription> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              data-testid={`${testID}-confirm`}
              onClick={() => {
                if (confirming) void action.fire(confirming);
                setConfirming(null);
              }}
            >
              {confirming?.label ?? m.workspace.run}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SettingsForm({
  recordView,
  sectionId,
  title,
  row: rowProp,
  onSaved,
  testID,
  screenLocked,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract
  recordView: RecordViewDef<ResourceContract<any>, any>;
  sectionId: string;
  title: string;
  row: DataRow;
  onSaved: (row: DataRow) => void;
  testID: string;
  screenLocked: string | null;
}) {
  const m = useUiMessages();
  const provider = useDataProvider();
  // After "take theirs": their row, shown until the record refetches with it.
  const [theirsRow, setTheirsRow] = useState<DataRow | null>(null);
  useEffect(() => setTheirsRow(null), [rowProp]);
  const row = theirsRow ?? rowProp;
  const view = recordView.view;
  const fields = recordView.settingsFields(sectionId);
  // A versioned resource checks the save against the version of the row shown (core README, "Versioned writes").
  const versionField = useCapabilities(view.resource, { enabled: !!provider.capabilities }).data?.version?.field;
  // The view's update guard, for this viewer: when it refuses, the settings are read-only with its reason.
  const viewer = useViewer();
  const locked = recordView.settingsLocked(row, viewer) ?? screenLocked;
  // Only the fields this person changed are theirs: the others show the row as it is now (a live
  // refresh updates them) and are never sent, so a stale draft can't overwrite someone else's change.
  const [edits, setEdits] = useState<Values>({});
  // The row the person started editing: their save is checked against its version, not against a
  // row that refreshed meanwhile (someone else's save would otherwise be overwritten).
  const editBase = useRef<DataRow | undefined>(undefined);
  useEffect(() => {
    if (Object.keys(edits).length === 0) editBase.current = undefined;
  }, [edits]);
  const draft = useMemo<Values>(
    () => ({ ...Object.fromEntries(fields.map((f) => [f.field.name, row[f.field.name]])), ...edits }),
    [fields, row, edits],
  );
  // An edit the row now holds (after a save, or someone else's same change) is no longer an edit.
  useEffect(() => {
    setEdits((current) => {
      const left = Object.fromEntries(Object.entries(current).filter(([k, v]) => !sameFormValue(v, row[k])));
      return Object.keys(left).length === Object.keys(current).length ? current : left;
    });
  }, [row]);
  const [invalid, setInvalid] = useState<Record<string, string>>({});
  const changed = useMemo(() => {
    const out: Values = {};
    for (const f of fields) {
      const name = f.field.name;
      if (!(name in edits)) continue;
      if (f.visible && !f.visible(draft)) continue; // a hidden field isn't saved
      if (!sameFormValue(draft[name], row[name])) out[name] = draft[name];
    }
    return out;
  }, [fields, draft, row, edits]);
  const dirty = Object.keys(changed).length > 0 && Object.keys(invalid).length === 0;

  const queryClient = useQueryClient();
  // The resource's own update; the list and record reads are the page's, so this one reads nothing.
  const { update } = useResource<DataRow & BaseRecord>(view.resource, { enabled: false, onError: alreadyShown });
  // A save that met someone else's change, and the values it tried to save.
  const [conflict, setConflict] = useState<{ conflict: WriteConflict; values: Values; row: DataRow } | null>(null);
  const save = useWrite(
    async ({ values, expectedVersion }: { values: Values; expectedVersion?: string }) => {
      // Only the section's listed keys, never anything else the row or draft holds.
      const data = recordView.settingsPatch(sectionId, values);
      const version = expectedVersion ?? (versionField ? (editBase.current ?? row)[versionField] : undefined);
      // Through the resource's write path (`update` with `expectedVersion`), not the provider
      // directly: a save made while another of this record is still in flight is checked against
      // the version that one commits, and the version this one commits goes into every cached copy.
      let saved: DataRow | null | undefined;
      try {
        saved = await update(recordView.recordId(row), data as Partial<DataRow & BaseRecord>, version != null ? { expectedVersion: String(version) } : undefined);
      } catch (error) {
        const found = writeConflict(error, data);
        if (found && isDataWriteError(error) && error.current) setConflict({ conflict: found, values, row: error.current });
        throw error;
      }
      // A write that matched no rows is a refusal, never a silent success.
      if (saved === null || saved === undefined) {
        throw new DataWriteError("forbidden", fillMessage(m.workspace.notChanged, { noun: view.noun }));
      }
      return saved;
    },
    // The edits stay until the row shows them (the effect below), so a saved value doesn't flash
    // back to the old one while the record refetches.
    {
      onSuccess: (saved) => {
        // The next edit builds on this save's version, even before the record refetches.
        if (versionField && saved[versionField] != null) editBase.current = { ...(editBase.current ?? row), [versionField]: saved[versionField] };
        onSaved(saved);
      },
    },
  );

  const keepMine = async () => {
    if (!conflict) return;
    const { values, conflict: c } = conflict;
    // The sheet stays up while this runs: a new conflict replaces it, any other failure rejects
    // (the sheet shows why), and success closes it.
    await save.run({ values, ...(c.currentVersion != null ? { expectedVersion: c.currentVersion } : {}) }).then(
      () => setConflict(null),
      (error: unknown) => {
        if (!writeConflict(error, values)) throw error;
      },
    );
  };
  const takeTheirs = () => {
    if (!conflict) return;
    const { row: theirs } = conflict;
    setConflict(null);
    save.reset();
    setEdits({});
    // Their row at once, then the refetch confirms it.
    setTheirsRow({ ...rowProp, ...theirs });
    void queryClient.invalidateQueries({ queryKey: [...resourceKeys(view.resource).all] });
  };

  const set = (name: string, value: unknown, error?: string) => {
    if (Object.keys(edits).length === 0 && editBase.current === undefined) editBase.current = row;
    save.reset();
    setInvalid(({ [name]: _old, ...rest }) => (error ? { ...rest, [name]: error } : rest));
    setEdits((d) => ({ ...d, [name]: value }));
  };

  return (
    <SettingsSection title={title} id={`${testID}-${sectionId}`}>
      {fields
        .filter((f) => !f.visible || f.visible(draft))
        .map((f) => (
          <SettingField
            key={f.field.name}
            field={f}
            value={draft[f.field.name]}
            error={invalid[f.field.name]}
            disabled={locked !== null}
            onChange={(v, error) => set(f.field.name, v, error)}
            testID={`${testID}-${f.field.name}`}
          />
        ))}
      {locked !== null ? (
        <p className="py-3 text-sm text-muted-foreground" data-testid={`${testID}-locked`}>
          {locked}
        </p>
      ) : (
      <div className="flex items-center justify-end gap-3 py-3">
        {save.error ? (
          <Alert variant="destructive" className="flex-1" data-testid={`${testID}-error`}>
            <AlertDescription>{save.error}</AlertDescription>
          </Alert>
        ) : null}
        <Button disabled={!dirty || save.pending} loading={save.pending} onClick={() => void save.fire({ values: changed })} data-testid={`${testID}-save`}>
          {m.workspace.save}
        </Button>
      </div>
      )}
      <ConflictSheet
        conflict={conflict?.conflict ?? null}
        noun={view.noun}
        label={(name) => fields.find((f) => f.field.name === name)?.label ?? name}
        onKeepMine={keepMine}
        onTakeTheirs={takeTheirs}
        onDismiss={() => setConflict(null)}
        testID={`${testID}-conflict`}
      />
    </SettingsSection>
  );
}

function SettingField({
  field: f,
  value,
  error,
  disabled,
  onChange,
  testID,
}: {
  field: ResolvedFormField;
  value: unknown;
  error?: string | undefined;
  disabled: boolean;
  onChange: (value: unknown, error?: string) => void;
  testID: string;
}) {
  const m = useUiMessages();
  const id = `${testID}-input`;
  if (f.display === "boolean") {
    return <ToggleRow label={f.label} checked={value === true} onCheckedChange={(v) => onChange(v)} disabled={disabled} testID={id} rowTestID={testID} />;
  }
  const empty = f.field.nullable ? null : "";
  // A field that can be empty, and that the view doesn't require, can be set back to empty.
  const clearable = f.field.nullable && !f.required;
  if (f.options?.length) {
    return (
      <SettingsRow label={f.label} htmlFor={id} testID={testID} disabled={disabled}>
        <Select
          value={value == null || value === "" ? (clearable ? NONE : "") : String(value)}
          onValueChange={(v) => onChange(v === NONE ? empty : v)}
          disabled={disabled}
        >
          <SelectTrigger id={id} className="w-48" data-testid={id}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {clearable ? (
              <SelectItem value={NONE} data-testid={`${id}-none`}>
                <span className="text-muted-foreground">{m.link.none}</span>
              </SelectItem>
            ) : null}
            {f.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsRow>
    );
  }
  if (f.display === "longText") {
    return (
      <SettingsRow label={f.label} htmlFor={id} testID={testID} disabled={disabled}>
        <Textarea
          id={id}
          data-testid={id}
          disabled={disabled}
          className="w-72"
          value={value == null ? "" : String(value)}
          maxLength={f.max}
          onChange={(e) => onChange(e.target.value === "" ? empty : e.target.value)}
        />
      </SettingsRow>
    );
  }
  // The form's type for the field (so `widget: "tel"` is a phone number here too), and the same
  // keyboard and autofill hints as a ResourceForm input. Selects, toggles and long text are above.
  const form = formType(f, false);
  // A form type that isn't an <input> type (a JSON blob's textarea, a badge without options)
  // stays a text input, as before.
  const type = form === "textarea" || form === "select" || form === "checkbox" ? "text" : form;
  const hints = inputHints(
    {
      ...(f.autoComplete ? { autoComplete: f.autoComplete } : {}),
      ...(f.inputMode ? { inputMode: f.inputMode } : {}),
      ...(f.enterKeyHint ? { enterKeyHint: f.enterKeyHint } : {}),
    },
    type,
  );
  return (
    <SettingsRow label={f.label} htmlFor={id} testID={testID} disabled={disabled} description={error}>
      <Input
        id={id}
        data-testid={id}
        className="w-72"
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        type={type}
        {...hints}
        required={f.required}
        maxLength={f.max}
        value={value == null ? "" : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") return onChange(empty);
          if (type !== "number") return onChange(raw);
          // Never NaN: a value that isn't a number keeps the text and blocks the save.
          const n = Number(raw.trim());
          return Number.isFinite(n) ? onChange(n) : onChange(raw, m.workspace.notANumber);
        }}
      />
    </SettingsRow>
  );
}

/** @deprecated Renamed `RecordViewProps`; its `workspace` prop is now `view`. */
export type ResourceWorkspaceProps<T extends Row = Row> = Omit<RecordViewProps<T>, "view"> & { workspace: RecordViewProps<T>["view"] };

/** @deprecated Renamed `RecordView`, with `view` in place of `workspace`. */
export function ResourceWorkspace<T extends Row = Row>({ workspace, ...props }: ResourceWorkspaceProps<T>) {
  return <RecordView<T> {...props} view={workspace} />;
}
