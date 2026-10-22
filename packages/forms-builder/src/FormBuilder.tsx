import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CircleCheck, Info, Redo2, Undo2, XCircle } from "lucide-react";
import type { FormDefinition } from "@marktiderman/genesis-forms";
import type { FormBrand } from "@marktiderman/genesis-forms-web";
import { Badge } from "@marktiderman/genesis-ui/badge";
import { Button } from "@marktiderman/genesis-ui/button";
import { Input } from "@marktiderman/genesis-ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@marktiderman/genesis-ui/tabs";
import { cn } from "@marktiderman/genesis-ui/utils";
import { analyze, type Analysis, type Finding } from "./analyze";
import { useBuilderHistory } from "./history";
import { LogicPanel } from "./logic";
import { updateForm, ruleRefs } from "./ops";
import { Preview } from "./preview";
import { QuestionsPanel } from "./questions";
import { EndingsPanel, JsonPanel, SettingsPanel } from "./settings";

export type BuilderTab = "questions" | "logic" | "endings" | "settings" | "json";

export interface FormBuilderProps {
  /** The definition to start from. Later changes to this prop are ignored; remount with a new `key` to load another form. */
  defaultValue: FormDefinition;
  /** Called after every edit (debounce it before saving a draft). */
  onChange?: (value: FormDefinition, analysis: Analysis) => void;
  /** The host's own buttons (Save draft, Publish…), shown in the toolbar. They get the current value. */
  actions?: (value: FormDefinition, analysis: Analysis) => ReactNode;
  /** A practice's name and logo for the preview. */
  brand?: FormBrand;
  /** Sample hidden-input values for the preview. */
  previewHidden?: Record<string, string | number | boolean>;
  /** Hide the JSON tab from non-technical authors. Default true (shown). */
  showJson?: boolean;
  defaultTab?: BuilderTab;
  className?: string;
}

const LEVEL_ICON = { error: XCircle, warning: AlertTriangle, info: Info } as const;

/**
 * A visual editor for one form definition: questions, logic, endings,
 * settings, with live checks and a live preview. It stores nothing; the host
 * saves what `onChange` gives it and publishes what `actions` receive.
 */
export function FormBuilder({
  defaultValue,
  onChange,
  actions,
  brand,
  previewHidden,
  showJson = true,
  defaultTab = "questions",
  className,
}: FormBuilderProps) {
  const history = useBuilderHistory(defaultValue);
  const def = history.value;
  const analysis = useMemo(() => analyze(def), [def]);
  const [tab, setTab] = useState<BuilderTab>(defaultTab);
  const [selected, setSelected] = useState<string | null>(null);

  // Report edits, not the initial value (also when StrictMode runs effects twice).
  const reported = useRef(defaultValue);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    if (reported.current === def) return;
    reported.current = def;
    onChangeRef.current?.(def, analysis);
  }, [def, analysis]);

  // Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z, except while typing in a text box (its own undo wins there).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      if (e.shiftKey) history.redo();
      else history.undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history]);

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
    <div className={cn("flex flex-col gap-4", className)} data-testid="form-builder">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Form title"
          className="h-10 min-w-48 flex-1 text-base font-semibold"
          value={def.title}
          onChange={(e) => history.apply((d) => updateForm(d, { title: e.target.value }), "form-title")}
        />
        <Button variant="ghost" size="icon" aria-label="Undo" disabled={!history.canUndo} onClick={history.undo} data-testid="builder-undo">
          <Undo2 />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Redo" disabled={!history.canRedo} onClick={history.redo} data-testid="builder-redo">
          <Redo2 />
        </Button>
        {errors ? (
          <Badge variant="destructive">{errors} to fix</Badge>
        ) : warnings ? (
          <Badge variant="warning">{warnings} to check</Badge>
        ) : (
          <Badge variant="success">
            <CircleCheck className="mr-1 size-3" /> Ready
          </Badge>
        )}
        {actions ? <div className="flex items-center gap-2">{actions(def, analysis)}</div> : null}
      </div>

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
              apply={history.apply}
              selected={selected}
              onSelect={setSelected}
              findings={analysis.findings}
              ruleCount={ruleCount}
            />
          </TabsContent>
          <TabsContent value="logic" className="mt-4">
            <LogicPanel def={def} apply={history.apply} findings={analysis.findings} />
          </TabsContent>
          <TabsContent value="endings" className="mt-4">
            <EndingsPanel def={def} apply={history.apply} findings={analysis.findings} />
          </TabsContent>
          <TabsContent value="settings" className="mt-4">
            <SettingsPanel def={def} apply={history.apply} />
          </TabsContent>
          {showJson ? (
            <TabsContent value="json" className="mt-4">
              <JsonPanel def={def} apply={history.apply} />
            </TabsContent>
          ) : null}
        </Tabs>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start" aria-label="Preview and checks">
          <Preview def={def} brand={brand} hidden={previewHidden} />
          <FindingsList findings={analysis.findings} onJump={jumpTo} />
        </aside>
      </div>
    </div>
  );
}

export function FindingsList({ findings, onJump }: { findings: Finding[]; onJump?: (f: Finding) => void }) {
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
