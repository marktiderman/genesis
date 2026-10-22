import {
  useDeferredValue,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { AlertTriangle, CircleCheck, Eye, Info, Redo2, Undo2, XCircle } from "lucide-react";
import { parseForm, type FieldValidator, type FormDefinition, type ParseResult } from "@marktiderman/genesis-forms";
import type { RendererRegistry } from "@marktiderman/genesis-forms-react";
import type { FormBrand } from "@marktiderman/genesis-forms-web";
import { Badge } from "@marktiderman/genesis-ui/badge";
import { Button } from "@marktiderman/genesis-ui/button";
import { Input } from "@marktiderman/genesis-ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@marktiderman/genesis-ui/tabs";
import { cn } from "@marktiderman/genesis-ui/utils";
import { analyze, type Analysis, type Finding } from "./analyze";
import { createDraftRegistry, DraftsContext } from "./controls";
import { BuilderConfigContext, type Apply, type BlockKinds, type BuilderConfig, type FieldPreset, type FieldTypeEditor } from "./editors";
import { useBuilderHistory } from "./history";
import { LogicPanel } from "./logic";
import { updateForm, ruleRefs } from "./ops";
import { Preview } from "./preview";
import { QuestionsPanel } from "./questions";
import { EndingsPanel, JsonPanel, SettingsPanel } from "./settings";

export type BuilderTab = "questions" | "logic" | "endings" | "settings" | "json";

/** Read and commit the builder's value from the host, for example from a ref in a Publish handler. */
export interface FormBuilderHandle {
  /** The current value, with every edit made so far (also one not rendered yet). Pending Key and name drafts are not in it: call `flush()` first. */
  getValue(): FormDefinition;
  /** The analysis of `getValue()`, run now if the deferred one has not caught up. */
  getAnalysis(): Analysis;
  /** Commit text still being typed in fields that save on blur (keys, hidden input names, numbers), then return `getValue()`. */
  flush(): FormDefinition;
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
  /** The field types authors may add, in this order (palette and Type select). Default: `defaultPalette()`, every registered type except the structured types (`STRUCTURED_FIELD_TYPES`), which a host opts into. */
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
   * The preview's renderers. It replaces `defaultRegistry` (it is `<Form registry>`),
   * so extend that one rather than passing only your own types:
   * `defaultRegistry.extend([{ type: "acme/signature", Component: Signature }])`.
   */
  previewRegistry?: RendererRegistry | undefined;
  /** Custom validators for the preview, by field id (as `createForm` takes them). */
  previewValidators?: Record<string, FieldValidator> | undefined;
  /** An organisation or business's name and logo for the preview. */
  brand?: FormBrand | undefined;
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
  defaultTab?: BuilderTab | undefined;
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
  previewRegistry,
  previewValidators,
  brand,
  previewHidden,
  readOnly = false,
  showJson = true,
  defaultTab = "questions",
  className,
}: FormBuilderProps) {
  // Edits are reported as they are made, never for the initial value (also under StrictMode).
  const history = useBuilderHistory(defaultValue, onChange ? { onChange } : {});
  const def = history.value;
  const parsed = parseOnce(def);
  // Checks follow the edits at their own pace, so typing never waits for them.
  const analysed = useDeferredValue(def);
  const analysis = useMemo(() => analyseOnce(analysed), [analysed]);
  const [tab, setTab] = useState<BuilderTab>(defaultTab);
  const [selected, setSelected] = useState<string | null>(null);

  const [drafts] = useState(createDraftRegistry);
  const readOnlyNoteId = useId();
  const config = useMemo<BuilderConfig>(
    () => ({ palette, fieldEditors, presets, blockKinds, readOnly }),
    [palette, fieldEditors, presets, blockKinds, readOnly],
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
    }),
    [history.get, drafts],
  );
  useImperativeHandle(ref, () => handle, [handle]);
  // Text still being typed is committed (and so reported) when the builder goes away.
  useLayoutEffect(() => () => drafts.flush(), [drafts]);

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

  const errors = analysis.findings.filter((f) => f.level === "error").length;
  const warnings = analysis.findings.filter((f) => f.level === "warning").length;

  const jumpTo = (f: Finding) => {
    if (!f.ref) return;
    if (f.ref.kind === "block") {
      setTab("questions");
      setSelected(f.ref.id);
    } else setTab(f.ref.kind === "rule" ? "logic" : "endings");
  };

  return (
    <BuilderConfigContext.Provider value={config}>
    <DraftsContext.Provider value={drafts}>
    <div
      className={cn("flex flex-col gap-4", className)}
      data-testid="form-builder"
      data-readonly={readOnly ? "" : undefined}
      onKeyDown={onKeyDown}
    >
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
        {errors ? (
          <Badge variant="destructive">{errors} to fix</Badge>
        ) : warnings ? (
          <Badge variant="warning">{warnings} to check</Badge>
        ) : (
          <Badge variant="success">
            <CircleCheck className="mr-1 size-3" /> Ready
          </Badge>
        )}
        {actions ? (
          <div className="flex items-center gap-2">{actions(def, analysis, { ...handle, analysing: analysed !== def })}</div>
        ) : null}
      </div>

      {readOnly ? (
        <p id={readOnlyNoteId} className="text-sm text-muted-foreground" data-testid="builder-readonly-note">
          You can look through every question, rule and ending, but not change them.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <Tabs defaultValue={defaultTab} value={tab} onValueChange={(v) => setTab(v as BuilderTab)} className="min-w-0">
          <TabsList className="flex w-full flex-wrap justify-start">
            <TabsTrigger value="questions">Questions</TabsTrigger>
            <TabsTrigger value="logic">
              Logic{def.logic?.length ? ` (${def.logic.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="endings">Endings</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            {showJson ? <TabsTrigger value="json">JSON</TabsTrigger> : null}
          </TabsList>
          <TabsContent value="questions" className="mt-4">
            <QuestionsPanel
              def={def}
              apply={apply}
              selected={selected}
              onSelect={setSelected}
              findings={analysis.findings}
              ruleCount={ruleCount}
            />
          </TabsContent>
          <TabsContent value="logic" className="mt-4">
            <LogicPanel def={def} apply={apply} findings={analysis.findings} />
          </TabsContent>
          <TabsContent value="endings" className="mt-4">
            <EndingsPanel def={def} apply={apply} findings={analysis.findings} />
          </TabsContent>
          <TabsContent value="settings" className="mt-4">
            <SettingsPanel def={def} apply={apply} />
          </TabsContent>
          {showJson ? (
            <TabsContent value="json" className="mt-4">
              <JsonPanel def={def} apply={apply} />
            </TabsContent>
          ) : null}
        </Tabs>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start" aria-label="Preview and checks">
          <Preview
            def={def}
            parsed={parsed}
            brand={brand}
            hidden={previewHidden}
            registry={previewRegistry}
            validators={previewValidators}
          />
          <FindingsList findings={analysis.findings} onJump={jumpTo} />
        </aside>
      </div>
    </div>
    </DraftsContext.Provider>
    </BuilderConfigContext.Provider>
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
