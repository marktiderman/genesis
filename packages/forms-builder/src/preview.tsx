import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { RotateCcw } from "lucide-react";
import {
  canonicalJson,
  createForm,
  parseForm,
  replay,
  type CreateFormOptions,
  type FieldValidator,
  type FormDefinition,
  type FormEngine,
  type ParseResult,
} from "@marktiderman/genesis-forms";
import type { FieldRendererProps, RendererRegistry } from "@marktiderman/genesis-forms-react";
import { defaultRegistry, Form, type FormBrand } from "@marktiderman/genesis-forms-web";
import { Button } from "@marktiderman/genesis-ui/button";
import { ToggleGroup, ToggleGroupItem } from "@marktiderman/genesis-ui/toggle-group";
import { structureFingerprint } from "./analyze";
import { chosenOutputs, type OutputTarget } from "./outputs";

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
  registry,
  validators,
  outputs,
}: {
  def: FormDefinition;
  /** `parseForm(def)`, when the caller already has it. */
  parsed?: ParseResult | undefined;
  brand?: FormBrand | undefined;
  /** Sample values for hidden inputs, so recall and logic on them can be tried. */
  hidden?: Record<string, string | number | boolean> | undefined;
  /** Passed to `<Form registry>`, replacing `defaultRegistry`: extend it (`defaultRegistry.extend([...])`). */
  registry?: RendererRegistry | undefined;
  /** Custom validators by field id, for the preview's engine. Read when a response starts (or Restart). */
  validators?: Record<string, FieldValidator> | undefined;
  /** The host's output targets: a question that uses one gets a "→ goes to …" note. */
  outputs?: readonly OutputTarget[] | undefined;
}) {
  const noted = useMemo(() => (outputs?.length ? withOutputNotes(registry ?? defaultRegistry) : registry), [outputs, registry]);
  const mode = def.layout?.mode ?? "focus";
  const [layout, setLayout] = useState<"focus" | "classic">(mode);
  // Follow the form's own layout setting; the toggle overrides it until it changes again.
  useEffect(() => setLayout(mode), [mode]);
  const [run, setRun] = useState(0);
  const parsed = useMemo(() => given ?? parseForm(def), [given, def]);
  const form = parsed.ok ? parsed.form : null;
  // Headings and text alone ask nothing: the form would read "Question 1 of 0".
  const empty = !!form && !form.blocks.some((b) => b.kind === "field");
  const hiddenKey = hidden ? canonicalJson(hidden) : "";
  const key = useMemo(
    () => (form ? `${structureFingerprint(form)}:${layout}:${run}:${hiddenKey}` : ""),
    [form, layout, run, hiddenKey],
  );

  const root = useRef<HTMLDivElement>(null);
  const refocus = useRef<Element | null>(null);
  // Focus inside the preview when its body remounted: given back to the same control in the new body.
  const lostFocus = useRef<{ el: Element; find: (root: HTMLElement) => HTMLElement | null } | null>(null);
  // The engine is held here, not by <Form>: a new definition there would start a new response.
  const [held, setHeld] = useState<{ key: string; form: FormDefinition; engine: FormEngine } | null>(null);
  let engine = held && held.form === form && held.key === key ? held.engine : null;
  if (form && !engine) {
    const options: Omit<CreateFormOptions, "clock" | "initialValues"> = {};
    if (hidden) options.hidden = hidden;
    if (validators) options.validators = validators;
    const active = typeof document === "undefined" ? null : document.activeElement;
    if (active && root.current?.contains(active)) lostFocus.current = { el: active, find: finder(active) };
    if (held && held.key === key) {
      // Same questions, new wording: carry the response over by replaying its events.
      engine = replay(form, held.engine.getState().events, options);
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
    // Focus was in the form body that just remounted (Ctrl+Z on a preview button, say):
    // give it to the same control in the new body, else to the preview itself, never to <body>.
    const lost = lostFocus.current;
    lostFocus.current = null;
    if (!lost || lost.el.isConnected || !root.current) return;
    const active = document.activeElement;
    if (active && active !== document.body && root.current.contains(active)) return;
    (lost.find(root.current) ?? root.current).focus();
  }, [engine]);

  return (
    <div className="space-y-2 outline-none" data-testid="builder-preview" ref={root} tabIndex={-1}>
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
          {empty ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 p-4 text-center" data-testid="builder-preview-empty">
              <p className="text-sm font-medium">Add a question to see it here.</p>
              <p className="text-xs text-muted-foreground">The preview shows the form as people will fill it in.</p>
            </div>
          ) : form && engine ? (
            // No onSubmit: a completed engine then shows its ending, also after a wording edit remounts it.
            <OutputsContext.Provider value={outputs ?? NO_OUTPUTS}>
              <Form form={form} engine={engine} layout={layout} brand={brand} {...(noted ? { registry: noted } : {})} />
            </OutputsContext.Provider>
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

const NO_OUTPUTS: readonly OutputTarget[] = [];
const OutputsContext = createContext<readonly OutputTarget[]>(NO_OUTPUTS);

/** One wrapper per renderer, so the preview's fields keep their identity (and state) across renders. */
const notedRenderers = new WeakMap<ComponentType<FieldRendererProps>, ComponentType<FieldRendererProps>>();
function notedRenderer(Renderer: ComponentType<FieldRendererProps>): ComponentType<FieldRendererProps> {
  let Noted = notedRenderers.get(Renderer);
  if (!Noted) {
    Noted = function NotedField(props: FieldRendererProps) {
      const labels = chosenOutputs(props.binding.field, useContext(OutputsContext)).map((t) => t.label);
      return (
        <>
          <Renderer {...props} />
          {labels.length ? (
            <p className="mt-2 text-xs text-muted-foreground" data-testid={`builder-preview-output-${props.binding.field.id}`}>
              <span aria-hidden="true">→ </span>goes to {labels.join(" and ")}
            </p>
          ) : null}
        </>
      );
    };
    notedRenderers.set(Renderer, Noted);
  }
  return Noted;
}

/** `base`, with each field's "→ goes to …" note under it. */
function withOutputNotes(base: RendererRegistry): RendererRegistry {
  const registry: RendererRegistry = {
    register(entry) {
      base.register(entry);
      return registry;
    },
    resolve(block) {
      const Renderer = base.resolve(block);
      return Renderer ? notedRenderer(Renderer) : undefined;
    },
    extend: (entries) => withOutputNotes(base.extend(entries)),
  };
  return registry;
}

/** Finds the control like `el` after a remount: by id, by name (and value, for radios), or by role and text. */
function finder(el: Element): (root: HTMLElement) => HTMLElement | null {
  const tag = el.tagName;
  const id = el.id;
  const name = el.getAttribute("name");
  const value = el.getAttribute("value");
  const text = el.textContent?.trim() ?? "";
  const label = el.getAttribute("aria-label");
  return (root) => {
    const all = Array.from(root.querySelectorAll<HTMLElement>(tag));
    if (id) return all.find((x) => x.id === id) ?? null;
    if (name) return all.find((x) => x.getAttribute("name") === name && x.getAttribute("value") === value) ?? null;
    return all.find((x) => x.getAttribute("aria-label") === label && (x.textContent?.trim() ?? "") === text) ?? null;
  };
}
