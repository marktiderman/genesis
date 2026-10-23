import {
  useDeferredValue,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { AlertTriangle, CircleCheck, Eye, Info, Redo2, Undo2, XCircle } from "lucide-react";
import { parseForm, type FieldValidator, type FormDefinition, type ParseResult } from "@marktiderman/genesis-forms";
import type { RendererRegistry } from "@marktiderman/genesis-forms-react";
import type { FormBrand, FormTheme } from "@marktiderman/genesis-forms-web";
import { Badge } from "@marktiderman/genesis-ui/badge";
import { Button } from "@marktiderman/genesis-ui/button";
import { Input } from "@marktiderman/genesis-ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@marktiderman/genesis-ui/tabs";
import { cn } from "@marktiderman/genesis-ui/utils";
import { analyze, type Analysis, type Finding } from "./analyze";
import { ChecksContext, visibleFindings, type ChecksState } from "./checks";
import { createDraftRegistry, DraftsContext, RowLayoutContext, type SettingsRowSlotProps } from "./controls";
import { BuilderConfigContext, type Apply, type BlockKinds, type BuilderConfig, type FieldPreset, type FieldTypeEditor } from "./editors";
import { useBuilderHistory } from "./history";
import type { OutputTarget } from "./outputs";
import { updateForm, ruleRefs } from "./ops";
import { Preview } from "./preview";
import { QuestionsPanel } from "./questions";
import { JsonPanel, LogicAndEndingsPanel, SettingsPanel } from "./settings";

/**
 * The builder's panels. `"logic"` is the one "Logic and endings" panel;
 * `"endings"` is kept as another name for it.
 */
export type BuilderTab = "questions" | "logic" | "endings" | "settings" | "json";

/** Read and commit the builder's value from the host, for example from a ref in a Publish handler. */
export interface FormBuilderHandle {
  /** The current value, with every edit made so far (also one not rendered yet). Pending Key and name drafts are not in it: call `flush()` first. */
  getValue(): FormDefinition;
  /** The analysis of `getValue()`, run now if the deferred one has not caught up. */
  getAnalysis(): Analysis;
  /** Commit text still being typed in fields that save on blur (keys, hidden input names, numbers), then return `getValue()`. */
  flush(): FormDefinition;
  /**
   * Show every check, including the "needs a title" error of a question just
   * added whose title field the author has not left yet. Call it when someone
   * tries to publish, so what blocks publishing is on screen.
   */
  revealChecks(): void;
  /** Undo the last edit, as the builder's own Undo button does. Does nothing when read-only or when there is nothing to undo. */
  undo(): void;
  /** Redo the last undone edit. Does nothing when read-only or when there is nothing to redo. */
  redo(): void;
  /** Whether `undo()` would change the value now. */
  canUndo(): boolean;
  /** Whether `redo()` would change the value now. */
  canRedo(): boolean;
}

/** Whether undo and redo can do anything, for a host's own Undo and Redo buttons. */
export interface BuilderHistoryState {
  canUndo: boolean;
  canRedo: boolean;
}

/** The third argument of `actions`: the handle, plus whether the analysis passed in is behind the value. */
export interface BuilderActionsState extends FormBuilderHandle {
  /** True while `analysis` is of an earlier value. Call `getAnalysis()` to gate on the current one. */
  analysing: boolean;
}

export interface FormBuilderProps {
  /** The definition to start from. Later changes to this prop are ignored; remount with a new `key` to load another form. */
  defaultValue: FormDefinition;
  /**
   * Called with the new value after every edit, undo and redo, at once (and
   * on unmount for text still being typed). Not called for `defaultValue`.
   * Debounce it before saving a draft.
   */
  onChange?: ((value: FormDefinition) => void) | undefined;
  /**
   * Called once the checks catch up with a value (they run behind fast
   * typing, so a burst of edits may get one call, for its last value). Also
   * called for the starting value.
   */
  onAnalysis?: ((analysis: Analysis, value: FormDefinition) => void) | undefined;
  /**
   * The host's own buttons (Save draft, Publish…), shown in the toolbar.
   * They get the current value and the latest analysis; while `analysing`,
   * that analysis is of an earlier value, so gate a publish on
   * `state.getAnalysis()` (and `state.flush()` for drafts) when clicked.
   */
  actions?: ((value: FormDefinition, analysis: Analysis, state: BuilderActionsState) => ReactNode) | undefined;
  /** Read the value synchronously, run the checks now, or commit pending drafts. */
  ref?: Ref<FormBuilderHandle> | undefined;
  /** The field types authors may add, in this order (palette and Type select). Default: `defaultPalette()`, every registered type except the opt-in ones (`STRUCTURED_FIELD_TYPES`, `COMPUTED_FIELD_TYPES`), which a host names to offer. */
  palette?: readonly string[] | undefined;
  /** How the builder edits particular field types: label, defaults, settings panel, logic value editor. */
  fieldEditors?: readonly FieldTypeEditor[] | undefined;
  /**
   * Named variants of field types for the Add menu, e.g. a table with fixed
   * columns or a list capped at three items (see `FieldPreset`). Each adds an
   * ordinary field of its base type; the Type select lists base types only.
   */
  presets?: readonly FieldPreset[] | undefined;
  /** Which non-question blocks authors may add. Default: headings, text and page breaks. */
  blockKinds?: BlockKinds | undefined;
  /**
   * Where a field's answer may also go besides the response, such as a column
   * of the respondent's record. Each question whose type a target accepts gets
   * a "Saves to" section listing them in plain language; choosing one sets
   * `props[target.prop] = target.value` on the field, which the host reads
   * after a submit. The preview notes each one under its question.
   */
  outputs?: readonly OutputTarget[] | undefined;
  /**
   * The preview's renderers. It replaces `defaultRegistry` (it is `<Form registry>`),
   * so extend that one rather than passing only your own types:
   * `defaultRegistry.extend([{ type: "acme/signature", Component: Signature }])`.
   */
  previewRegistry?: RendererRegistry | undefined;
  /** Custom validators for the preview, by field id (as `createForm` takes them). */
  previewValidators?: Record<string, FieldValidator> | undefined;
  /** An organisation or business's name and logo for the preview. */
  brand?: FormBrand | undefined;
  /** The accent colour and header image for the preview (`<Form theme>`). */
  theme?: FormTheme | undefined;
  /** The preview's send button word, as the live form uses it (`<Form submitLabel>`). Default "Send". */
  submitLabel?: string | undefined;
  /** Sample hidden-input values for the preview. */
  previewHidden?: Record<string, string | number | boolean> | undefined;
  /**
   * Show the form without letting anyone change it, for people who may read
   * it but not edit it. Every panel stays visible and openable; inputs,
   * selects and switches are disabled; add, remove, reorder, duplicate and
   * drag are hidden; undo/redo are hidden; and `onChange` is never called.
   * The preview, checks and `actions` still work. Default false.
   */
  readOnly?: boolean | undefined;
  /** Hide the JSON tab from non-technical authors. Default true (shown). */
  showJson?: boolean | undefined;
  /** The panel shown first, when `tab` is not set. Default `"questions"`. */
  defaultTab?: BuilderTab | undefined;
  /**
   * The panel shown, for a host that controls it (with `onTabChange`), for
   * example from its own row of tabs with `tabs={false}`.
   */
  tab?: BuilderTab | undefined;
  /** Called when the builder wants another panel: its own tab bar, or a check that points at a rule or an ending. */
  onTabChange?: ((tab: BuilderTab) => void) | undefined;
  /**
   * Show the builder's own row of tabs. `false` hides it, so a host can put
   * Questions, Logic and endings and Settings in its own single row of tabs
   * and pass the chosen one as `tab`. The title, checks and preview stay.
   * Default true.
   */
  tabs?: boolean | undefined;
  /** The host's own settings, shown under the builder's form settings, so a form has one Settings panel. */
  settingsExtra?: ReactNode | undefined;
  /**
   * Lay out the Settings panel yourself: it gets the builder's form settings
   * (title, introduction, layout, privacy, hidden inputs) as one node, and
   * what it returns is the whole panel, in place of those settings, then
   * `settingsExtra`, beside the preview. For example
   * `(form) => <SettingsPage sections={[{ id: "form", title: "Form", content: form }, …]} />`.
   */
  settingsLayout?: ((formSettings: ReactNode) => ReactNode) | undefined;
  /**
   * The row the form settings use for each labelled control: label, a
   * one-sentence description, then the control. It takes genesis-ui's
   * `SettingsRow` as it is (`settingsRow={SettingsRow}`), so the builder's
   * rows match the host's. Default: the builder's own stacked rows.
   */
  settingsRow?: ComponentType<SettingsRowSlotProps> | undefined;
  /**
   * Show the builder's toolbar: the form title, Undo and Redo, the status
   * badge and `actions`. `false` hides the whole row, for a host whose own
   * page header shows the title and those buttons (drive undo with the ref's
   * `undo()` / `redo()` and `onHistoryChange`, readiness with `onAnalysis`).
   * The read-only note stays. Default true.
   */
  toolbar?: boolean | undefined;
  /**
   * Called with whether undo and redo can do anything, once on mount and
   * whenever that changes, so a host's own Undo and Redo buttons stay in step.
   */
  onHistoryChange?: ((state: BuilderHistoryState) => void) | undefined;
  className?: string | undefined;
}

// The edit sink of a read-only builder: panels may still call it, nothing changes.
const IGNORE_EDIT: Apply = () => {};

const LEVEL_ICON = { error: XCircle, warning: AlertTriangle, info: Info } as const;

// One parse and one analysis per definition value, shared by the preview, the checks and the handle.
const parses = new WeakMap<FormDefinition, ParseResult>();
function parseOnce(def: FormDefinition): ParseResult {
  let result = parses.get(def);
  if (!result) parses.set(def, (result = parseForm(def)));
  return result;
}
const analyses = new WeakMap<FormDefinition, Analysis>();
function analyseOnce(def: FormDefinition): Analysis {
  let result = analyses.get(def);
  if (!result) analyses.set(def, (result = analyze(def, { parsed: parseOnce(def) })));
  return result;
}

/**
 * A visual editor for one form definition: questions, logic, endings,
 * settings, with live checks and a live preview. It stores nothing; the host
 * saves what `onChange` gives it and publishes what `actions` receive.
 */
export function FormBuilder({
  defaultValue,
  onChange,
  onAnalysis,
  actions,
  ref,
  palette,
  fieldEditors,
  presets,
  blockKinds,
  outputs,
  previewRegistry,
  previewValidators,
  brand,
  theme,
  submitLabel,
  previewHidden,
  readOnly = false,
  showJson = true,
  defaultTab = "questions",
  tab: controlledTab,
  onTabChange,
  tabs = true,
  settingsExtra,
  settingsLayout,
  settingsRow,
  toolbar = true,
  onHistoryChange,
  className,
}: FormBuilderProps) {
  // Edits are reported as they are made, never for the initial value (also under StrictMode).
  const history = useBuilderHistory(defaultValue, onChange ? { onChange } : {});
  const def = history.value;
  const parsed = parseOnce(def);
  // Checks follow the edits at their own pace, so typing never waits for them.
  const analysed = useDeferredValue(def);
  const analysis = useMemo(() => analyseOnce(analysed), [analysed]);
  const [ownTab, setOwnTab] = useState<BuilderTab>(defaultTab);
  // "endings" is the merged panel's older name.
  const tab = (controlledTab ?? ownTab) === "endings" ? "logic" : (controlledTab ?? ownTab);
  const setTab = (next: BuilderTab) => {
    if (controlledTab === undefined) setOwnTab(next);
    onTabChange?.(next);
  };
  const [selected, setSelected] = useState<string | null>(null);

  // Questions added here, held back from the "needs a title" check until their title field is left.
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());
  const [revealed, setRevealed] = useState(false);
  const checks = useMemo<ChecksState>(
    () => ({
      fresh,
      revealed,
      markFresh: (id) => setFresh((s) => new Set(s).add(id)),
      touch: (id) =>
        setFresh((s) => {
          if (!s.has(id)) return s;
          const next = new Set(s);
          next.delete(id);
          return next;
        }),
    }),
    [fresh, revealed],
  );

  const [drafts] = useState(createDraftRegistry);
  const readOnlyNoteId = useId();
  const config = useMemo<BuilderConfig>(
    () => ({ palette, fieldEditors, presets, blockKinds, outputs, readOnly }),
    [palette, fieldEditors, presets, blockKinds, outputs, readOnly],
  );
  // Every edit goes through `apply`, so a read-only builder cannot change the
  // value (or call onChange) even from a control the panels forgot to hide.
  const apply = readOnly ? IGNORE_EDIT : history.apply;

  const handle = useMemo<FormBuilderHandle>(
    () => ({
      getValue: history.get,
      getAnalysis: () => analyseOnce(history.get()),
      flush: () => {
        drafts.flush();
        return history.get();
      },
      revealChecks: () => setRevealed(true),
      undo: () => {
        if (!readOnly) history.undo();
      },
      redo: () => {
        if (!readOnly) history.redo();
      },
      canUndo: () => !readOnly && history.getStatus().canUndo,
      canRedo: () => !readOnly && history.getStatus().canRedo,
    }),
    [history.get, history.undo, history.redo, history.getStatus, drafts, readOnly],
  );
  useImperativeHandle(ref, () => handle, [handle]);
  // Text still being typed is committed (and so reported) when the builder goes away.
  useLayoutEffect(() => () => drafts.flush(), [drafts]);

  // The host's Undo and Redo buttons follow the builder's own.
  const onHistoryChangeRef = useRef(onHistoryChange);
  useEffect(() => {
    onHistoryChangeRef.current = onHistoryChange;
  });
  const canUndo = !readOnly && history.canUndo;
  const canRedo = !readOnly && history.canRedo;
  useEffect(() => {
    onHistoryChangeRef.current?.({ canUndo, canRedo });
  }, [canUndo, canRedo]);

  const analysedReported = useRef<FormDefinition | null>(null);
  const onAnalysisRef = useRef(onAnalysis);
  useEffect(() => {
    onAnalysisRef.current = onAnalysis;
  });
  useEffect(() => {
    // Wait until the analysis is of this value.
    if (analysed !== def || analysedReported.current === def) return;
    analysedReported.current = def;
    onAnalysisRef.current?.(analysis, def);
  }, [def, analysed, analysis]);

  // Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z inside the builder, except while typing in
  // a text box (its own undo wins there). The host page keeps its own shortcuts.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (readOnly) return;
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
    const t = e.target as HTMLElement;
    if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
    e.preventDefault();
    if (e.shiftKey) history.redo();
    else history.undo();
  };

  const ruleCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const rule of def.logic ?? []) for (const id of ruleRefs(rule)) counts.set(id, (counts.get(id) ?? 0) + 1);
    return (id: string) => counts.get(id) ?? 0;
  }, [def.logic]);

  const shown = useMemo(() => visibleFindings(analysis.findings, checks), [analysis.findings, checks]);
  const noQuestions = analysis.findings.some((f) => f.code === "no-questions");
  const errors = shown.filter((f) => f.level === "error").length;
  const warnings = shown.filter((f) => f.level === "warning").length;
  // Errors held back (a new question still being written): not ready, but nothing to fix yet.
  const pending = !errors && analysis.findings.some((f) => f.level === "error");

  const preview = (
    <Preview
      def={def}
      parsed={parsed}
      brand={brand}
      theme={theme}
      submitLabel={submitLabel}
      hidden={previewHidden}
      registry={previewRegistry}
      validators={previewValidators}
      outputs={outputs}
    />
  );

  const jumpTo = (f: Finding) => {
    if (!f.ref) return;
    if (f.ref.kind === "block") {
      setTab("questions");
      setSelected(f.ref.id);
    } else setTab("logic");
  };
  const checksList = <FindingsList findings={shown} onJump={jumpTo} />;
  const formSettings = (
    <RowLayoutContext.Provider value={settingsRow ?? null}>
      <SettingsPanel def={def} apply={apply} />
    </RowLayoutContext.Provider>
  );

  return (
    <BuilderConfigContext.Provider value={config}>
    <DraftsContext.Provider value={drafts}>
    <ChecksContext.Provider value={checks}>
    <div
      className={cn("flex flex-col gap-4", className)}
      data-testid="form-builder"
      data-readonly={readOnly ? "" : undefined}
      onKeyDown={onKeyDown}
    >
      {toolbar ? (
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Form title"
          className="h-10 min-w-48 flex-1 text-base font-semibold"
          value={def.title}
          readOnly={readOnly}
          aria-describedby={readOnly ? readOnlyNoteId : undefined}
          onChange={(e) => apply((d) => updateForm(d, { title: e.target.value }), "form-title")}
        />
        {readOnly ? (
          <Badge variant="muted" data-testid="builder-readonly">
            <Eye className="mr-1 size-3" aria-hidden /> Read only
          </Badge>
        ) : (
          <>
            <Button variant="ghost" size="icon" aria-label="Undo" disabled={!history.canUndo} onClick={history.undo} data-testid="builder-undo">
              <Undo2 />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Redo" disabled={!history.canRedo} onClick={history.redo} data-testid="builder-redo">
              <Redo2 />
            </Button>
          </>
        )}
        {noQuestions ? (
          // A new form is not broken: it just asks nothing yet.
          <Badge variant="muted" data-testid="builder-status">Add a question</Badge>
        ) : errors ? (
          <Badge variant="destructive" data-testid="builder-status">{errors} to fix</Badge>
        ) : pending ? (
          <Badge variant="muted" data-testid="builder-status">In progress</Badge>
        ) : warnings ? (
          <Badge variant="warning" data-testid="builder-status">{warnings} to check</Badge>
        ) : (
          <Badge variant="success" data-testid="builder-status">
            <CircleCheck className="mr-1 size-3" /> Ready
          </Badge>
        )}
        {actions ? (
          <div className="flex items-center gap-2">{actions(def, analysis, { ...handle, analysing: analysed !== def })}</div>
        ) : null}
      </div>
      ) : null}

      {readOnly ? (
        <p id={readOnlyNoteId} className="text-sm text-muted-foreground" data-testid="builder-readonly-note">
          You can look through every question, rule and ending, but not change them.
        </p>
      ) : null}

      <Tabs defaultValue={tab} value={tab} onValueChange={(v) => setTab(v as BuilderTab)} className="min-w-0">
        {tabs ? (
          <TabsList className="flex h-auto w-full flex-wrap justify-start">
            <TabsTrigger value="questions">Questions</TabsTrigger>
            <TabsTrigger value="logic">
              Logic and endings{def.logic?.length ? ` (${def.logic.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            {showJson ? <TabsTrigger value="json">JSON</TabsTrigger> : null}
          </TabsList>
        ) : null}
        <TabsContent value="questions" className={tabs ? "mt-4" : "mt-0"}>
          <QuestionsPanel
            def={def}
            apply={apply}
            selected={selected}
            onSelect={setSelected}
            findings={shown}
            ruleCount={ruleCount}
            onOpenEnding={() => setTab("logic")}
            preview={
              <div className="space-y-4">
                {preview}
                {checksList}
              </div>
            }
          />
        </TabsContent>
        <TabsContent value="logic" className={tabs ? "mt-4" : "mt-0"}>
          <LogicAndEndingsPanel def={def} apply={apply} findings={shown} aside={checksList} />
        </TabsContent>
        <TabsContent value="settings" className={tabs ? "mt-4" : "mt-0"}>
          {settingsLayout ? (
            settingsLayout(formSettings)
          ) : (
            <WithPreview aside={<>{preview}{checksList}</>}>
              {formSettings}
              {settingsExtra ? <div className="mt-6" data-testid="builder-settings-extra">{settingsExtra}</div> : null}
            </WithPreview>
          )}
        </TabsContent>
        {showJson ? (
          <TabsContent value="json" className={tabs ? "mt-4" : "mt-0"}>
            <WithPreview aside={<>{preview}{checksList}</>}>
              <JsonPanel def={def} apply={apply} />
            </WithPreview>
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
    </ChecksContext.Provider>
    </DraftsContext.Provider>
    </BuilderConfigContext.Provider>
  );
}

/** A panel with the preview and checks beside it (under it in a narrow container). */
function WithPreview({ aside, children }: { aside: ReactNode; children: ReactNode }) {
  return (
    <div className="@container">
      <div className="grid items-start gap-6 @4xl:grid-cols-[minmax(0,1fr)_24.5rem]">
        <div className="min-w-0">{children}</div>
        <aside className="min-w-0 space-y-4 @4xl:sticky @4xl:top-4" aria-label="Preview and checks">
          {aside}
        </aside>
      </div>
    </div>
  );
}

export function FindingsList({ findings, onJump }: { findings: Finding[]; onJump?: ((f: Finding) => void) | undefined }) {
  if (!findings.length) {
    return <p className="text-sm text-muted-foreground">No problems found: every question and ending can be reached.</p>;
  }
  return (
    <ul className="space-y-1.5" aria-label="Checks" data-testid="builder-findings">
      {findings.map((f, i) => {
        const Icon = LEVEL_ICON[f.level];
        return (
          <li key={i}>
            <button
              type="button"
              disabled={!f.ref || !onJump}
              onClick={() => onJump?.(f)}
              className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent disabled:hover:bg-transparent"
            >
              <Icon
                aria-label={f.level}
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  f.level === "error" ? "text-destructive" : f.level === "warning" ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground",
                )}
              />
              <span>{f.message}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
