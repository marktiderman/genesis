import { useMemo, useState } from "react";
import { createForm, parseForm, type FormDefinition, type FormEngine } from "@marktiderman/genesis-forms";
import { validateSubmission } from "@marktiderman/genesis-forms/server";
import { useFormSelector } from "@marktiderman/genesis-forms-react";
import { Form } from "@marktiderman/genesis-forms-web";
import { Badge } from "@marktiderman/genesis-ui/badge";
import { Button } from "@marktiderman/genesis-ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@marktiderman/genesis-ui/card";
import { Input } from "@marktiderman/genesis-ui/input";
import { Label } from "@marktiderman/genesis-ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@marktiderman/genesis-ui/tabs";
import { Textarea } from "@marktiderman/genesis-ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@marktiderman/genesis-ui/toggle-group";
import { playgroundForms } from "../lib/forms";

type FormKey = keyof typeof playgroundForms;
type Layout = "focus" | "classic";

const pretty = (value: unknown) => JSON.stringify(value, null, 2);

/**
 * Forms playground: run a form end to end without a backend. The preview is
 * the real <Form>; the panels show the engine's live state, its event log,
 * and what the server check (`validateSubmission`) would accept and store.
 */
export default function FormsPlayground() {
  const [formKey, setFormKey] = useState<FormKey>("after-class");
  const [definition, setDefinition] = useState<FormDefinition>(playgroundForms["after-class"].definition);
  const [draft, setDraft] = useState(pretty(definition));
  const [layout, setLayout] = useState<Layout>("focus");
  const [coach, setCoach] = useState("Sam");
  const [run, setRun] = useState(0);

  const parsed = useMemo(() => {
    try {
      return parseForm(JSON.parse(draft));
    } catch (e) {
      return { ok: false as const, issues: [{ path: "", message: (e as Error).message }], warnings: [] };
    }
  }, [draft]);

  const context = useMemo(() => ({ coach, class: "06:00 CrossFit" }), [coach]);
  // A fresh engine per run, definition or context change; the preview remounts with it.
  const [engine, engineKey] = useMemo(
    () => [createForm(definition, { hidden: context }), `${definition.id}-${run}-${Date.now()}`] as const,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [definition, context, run],
  );

  const pickForm = (key: FormKey) => {
    const def = playgroundForms[key].definition;
    setFormKey(key);
    setDefinition(def);
    setDraft(pretty(def));
  };

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Forms playground</h1>
        <p className="text-muted-foreground">
          The real form on the left; the engine, the event log and the server check on the right. Nothing is stored.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label>Form</Label>
          <ToggleGroup type="single" variant="outline" value={formKey} onValueChange={(v) => v && pickForm(v as FormKey)}>
            <ToggleGroupItem value="after-class">After class</ToggleGroupItem>
            <ToggleGroupItem value="monthly-pulse">Monthly pulse</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="space-y-1">
          <Label>Layout</Label>
          <ToggleGroup type="single" variant="outline" value={layout} onValueChange={(v) => v && setLayout(v as Layout)}>
            <ToggleGroupItem value="focus">One at a time</ToggleGroupItem>
            <ToggleGroupItem value="classic">All on one page</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="space-y-1">
          <Label htmlFor="pg-coach">Coach (resolved by the server)</Label>
          <Input id="pg-coach" value={coach} onChange={(e) => setCoach(e.target.value)} className="w-40" />
        </div>
        <Button variant="outline" onClick={() => setRun((n) => n + 1)}>
          Start over
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <Form key={`${engineKey}-${layout}`} form={definition} engine={engine} layout={layout} />
          </CardContent>
        </Card>
        <Inspector engine={engine} context={context} draft={draft} setDraft={setDraft} parsed={parsed} apply={() => parsed.ok && setDefinition(parsed.form)} />
      </div>
    </div>
  );
}

function Inspector({
  engine,
  context,
  draft,
  setDraft,
  parsed,
  apply,
}: {
  engine: FormEngine;
  context: Record<string, string>;
  draft: string;
  setDraft: (s: string) => void;
  parsed: ReturnType<typeof parseForm>;
  apply: () => void;
}) {
  const state = useFormSelector(engine, (s) => s);
  const server = useMemo(
    () =>
      validateSubmission(engine.definition, { events: state.events }, { context, complete: state.status === "completed" }),
    [engine, state, context],
  );
  const keyOf = (id: string) => engine.field(id)?.key ?? id;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Inspector <Badge variant="outline">{state.status === "completed" ? "completed" : "in progress"}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="state">
          <TabsList>
            <TabsTrigger value="state">State</TabsTrigger>
            <TabsTrigger value="events">Events ({state.events.length})</TabsTrigger>
            <TabsTrigger value="server">Server check</TabsTrigger>
            <TabsTrigger value="definition">Definition</TabsTrigger>
          </TabsList>
          <TabsContent value="state" className="space-y-3">
            <p className="text-sm">
              <span className="font-medium">Path:</span> {state.path.map(keyOf).join(" → ")}
            </p>
            <p className="text-sm">
              <span className="font-medium">Visible:</span>{" "}
              {state.path.filter((id) => engine.field(id) && engine.isVisible(id)).map(keyOf).join(", ")}
            </p>
            <Pre value={{ values: state.values, errors: state.errors, current: state.current, ending: state.ending }} />
          </TabsContent>
          <TabsContent value="events">
            <Pre value={state.events} />
          </TabsContent>
          <TabsContent value="server" className="space-y-2">
            <p className="text-sm text-muted-foreground">
              What the server accepts after replaying the event log against the definition
              {state.status === "completed" ? "" : " (checked as a draft until submitted)"}.
            </p>
            <Pre value={server} />
          </TabsContent>
          <TabsContent value="definition" className="space-y-2">
            <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={18} className="font-mono text-xs" />
            {parsed.ok ? (
              <p className="text-sm text-muted-foreground">Valid{parsed.warnings.length ? ` · ${parsed.warnings.length} warning(s)` : ""}.</p>
            ) : null}
            <Pre value={parsed.ok ? parsed.warnings : parsed.issues} />
            <Button onClick={apply} disabled={!parsed.ok}>
              Apply definition
            </Button>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function Pre({ value }: { value: unknown }) {
  return <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">{pretty(value)}</pre>;
}
