import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import {
  canonicalJson,
  createForm,
  parseForm,
  replay,
  type FormDefinition,
  type FormEngine,
  type ParseResult,
} from "@marktiderman/genesis-forms";
import { Form, type FormBrand } from "@marktiderman/genesis-forms-web";
import { Button } from "@marktiderman/genesis-ui/button";
import { ToggleGroup, ToggleGroupItem } from "@marktiderman/genesis-ui/toggle-group";
import { structureFingerprint } from "./analyze";

/**
 * The real `<Form>` in a phone-sized frame. It starts over when what is asked
 * changes (questions, logic, layout, Restart); a wording edit keeps the
 * answers given so far and shows the new text. Submitting only shows the
 * ending; nothing is sent.
 */
export function Preview({
  def,
  parsed: given,
  brand,
  hidden,
}: {
  def: FormDefinition;
  /** `parseForm(def)`, when the caller already has it. */
  parsed?: ParseResult;
  brand?: FormBrand;
  /** Sample values for hidden inputs, so recall and logic on them can be tried. */
  hidden?: Record<string, string | number | boolean>;
}) {
  const mode = def.layout?.mode ?? "focus";
  const [layout, setLayout] = useState<"focus" | "classic">(mode);
  // Follow the form's own layout setting; the toggle overrides it until it changes again.
  useEffect(() => setLayout(mode), [mode]);
  const [run, setRun] = useState(0);
  const parsed = useMemo(() => given ?? parseForm(def), [given, def]);
  const form = parsed.ok ? parsed.form : null;
  const hiddenKey = hidden ? canonicalJson(hidden) : "";
  const key = useMemo(
    () => (form ? `${structureFingerprint(form)}:${layout}:${run}:${hiddenKey}` : ""),
    [form, layout, run, hiddenKey],
  );

  const root = useRef<HTMLDivElement>(null);
  const refocus = useRef<Element | null>(null);
  // The engine is held here, not by <Form>: a new definition there would start a new response.
  const [held, setHeld] = useState<{ key: string; form: FormDefinition; engine: FormEngine } | null>(null);
  let engine = held && held.form === form && held.key === key ? held.engine : null;
  if (form && !engine) {
    const options = hidden ? { hidden } : {};
    if (held && held.key === key) {
      // Same questions, new wording: carry the response over by replaying its events.
      engine = replay(form, held.engine.getState().events, options);
      const active = typeof document === "undefined" ? null : document.activeElement;
      if (active && !root.current?.contains(active)) refocus.current = active;
    } else engine = createForm(form, options);
    setHeld({ key, form, engine });
  }
  // The new engine remounts the form body, and an ending on screen takes focus as it mounts:
  // give focus back to the builder control being typed in.
  useLayoutEffect(() => {
    const el = refocus.current;
    refocus.current = null;
    if (el instanceof HTMLElement && el.isConnected && document.activeElement !== el) el.focus();
  }, [engine]);

  return (
    <div className="space-y-2" data-testid="builder-preview" ref={root}>
      <div className="flex items-center gap-2">
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={layout}
          onValueChange={(v) => v && setLayout(v as "focus" | "classic")}
          aria-label="Preview layout"
        >
          <ToggleGroupItem value="focus">One at a time</ToggleGroupItem>
          <ToggleGroupItem value="classic">One page</ToggleGroupItem>
        </ToggleGroup>
        <span className="flex-1" />
        <Button variant="ghost" size="sm" onClick={() => setRun((n) => n + 1)} aria-label="Restart preview">
          <RotateCcw /> Restart
        </Button>
      </div>
      <div className="mx-auto w-full max-w-sm overflow-hidden rounded-[1.75rem] border-4 border-foreground/10 bg-background shadow-sm">
        <div className="h-[36rem] overflow-y-auto p-4">
          {form && engine ? (
            <Form form={form} engine={engine} layout={layout} brand={brand} onSubmit={() => undefined} />
          ) : (
            <div className="space-y-2 p-4 text-sm">
              <p className="font-medium">The preview starts once the form is valid.</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                {parsed.ok ? null : parsed.issues.slice(0, 5).map((i, n) => <li key={n}>{i.message}</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
