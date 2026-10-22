import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { parseForm, type FormDefinition, type HiddenInput } from "@marktiderman/genesis-forms";
import { Badge } from "@marktiderman/genesis-ui/badge";
import { Button } from "@marktiderman/genesis-ui/button";
import { Textarea } from "@marktiderman/genesis-ui/textarea";
import { DraftInput, Pick, SelectRow, SwitchRow, TextRow } from "./controls";
import type { Finding } from "./analyze";
import { addEnding, addHidden, removeEnding, removeHidden, updateEnding, updateForm, updateHidden, updateSettings } from "./ops";

type Apply = (edit: (def: FormDefinition) => FormDefinition, coalesce?: string) => void;

export function EndingsPanel({ def, apply, findings }: { def: FormDefinition; apply: Apply; findings: Finding[] }) {
  const endings = def.endings ?? [];
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        The first ending is shown when a respondent finishes normally. Add more and send people to them with jump rules.
      </p>
      <ol className="space-y-2">
        {endings.map((e, i) => {
          const warn = findings.filter((f) => f.ref?.kind === "ending" && f.ref.id === e.id);
          return (
            <li key={e.id} className="space-y-3 rounded-lg border bg-card p-4" data-testid={`builder-ending-${e.id}`}>
              <div className="flex items-center gap-2">
                <Badge variant={i === 0 ? "default" : "muted"}>{i === 0 ? "Default ending" : "Ending"}</Badge>
                <code className="text-xs text-muted-foreground">{e.id}</code>
                {warn.length ? <Badge variant="warning">Unreachable</Badge> : null}
                <span className="flex-1" />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Delete ending"
                  disabled={i === 0}
                  onClick={() => apply((d) => removeEnding(d, e.id))}
                >
                  <Trash2 />
                </Button>
              </div>
              <TextRow label="Title" value={e.title} onChange={(title) => apply((d) => updateEnding(d, e.id, { title }), `ending-title:${e.id}`)} />
              <TextRow
                label="Message"
                multiline
                value={e.description ?? ""}
                onChange={(description) => apply((d) => updateEnding(d, e.id, { description }), `ending-desc:${e.id}`)}
              />
            </li>
          );
        })}
      </ol>
      <Button variant="outline" size="sm" onClick={() => apply((d) => addEnding(d))} data-testid="builder-add-ending">
        <Plus /> Add ending
      </Button>
    </div>
  );
}

export function SettingsPanel({ def, apply }: { def: FormDefinition; apply: Apply }) {
  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <h3 className="text-sm font-semibold">Form</h3>
        <TextRow
          label="Title"
          value={def.title}
          testID="builder-form-title"
          onChange={(title) => apply((d) => updateForm(d, { title }), "form-title")}
        />
        <TextRow
          label="Introduction"
          multiline
          value={def.description ?? ""}
          hint="Shown before the first question."
          onChange={(description) => apply((d) => updateForm(d, { description }), "form-description")}
        />
        <SelectRow
          label="Layout"
          value={def.layout?.mode ?? "focus"}
          options={[
            { value: "focus", label: "One question at a time" },
            { value: "classic", label: "All questions on one page" },
          ]}
          onChange={(mode) => apply((d) => updateForm(d, { layout: { mode: mode as "focus" | "classic" } }))}
        />
      </section>
      <section className="space-y-4">
        <h3 className="text-sm font-semibold">Privacy</h3>
        <SwitchRow
          label="Anonymous responses"
          testID="builder-anonymous"
          hint="Questions marked “identifies the respondent” are not asked, and nothing identifying is stored."
          checked={!!def.settings?.anonymous}
          onChange={(anonymous) => apply((d) => updateSettings(d, { anonymous }))}
        />
        <SwitchRow
          label="Clear answers to hidden questions"
          hint="When logic hides a question after it was answered, its answer is dropped on submit."
          checked={def.settings?.clearHiddenValues !== false}
          onChange={(clearHiddenValues) => apply((d) => updateSettings(d, { clearHiddenValues }))}
        />
      </section>
      <HiddenInputsSection def={def} apply={apply} />
    </div>
  );
}

const SOURCE_LABEL: Record<HiddenInput["source"], string> = {
  url: "From the link (?name=…)",
  host: "From the app showing the form",
  server: "Set by the server (trusted)",
};

function HiddenInputsSection({ def, apply }: { def: FormDefinition; apply: Apply }) {
  const hidden = def.hidden ?? [];
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Hidden inputs</h3>
        <p className="text-xs text-muted-foreground">
          Values the respondent doesn't type, such as the class or coach. Use them in logic, or in wording with{" "}
          <code>{"{{hidden:name}}"}</code>. Only server inputs can be trusted.
        </p>
      </div>
      {hidden.length ? (
        <ul className="space-y-2">
          {hidden.map((h, i) => (
            // Keyed by position: the name changes as it is typed.
            <li key={i} className="flex flex-wrap items-end gap-2 rounded-md border p-3">
              <div className="min-w-32 flex-1 space-y-1.5">
                <span className="text-xs text-muted-foreground">Name</span>
                <HiddenName name={h.name} onCommit={(name) => apply((d) => updateHidden(d, h.name, { name }))} />
              </div>
              <Pick
                ariaLabel="Type"
                className="w-32"
                value={h.type}
                options={[
                  { value: "string", label: "Text" },
                  { value: "number", label: "Number" },
                  { value: "boolean", label: "Yes/no" },
                ]}
                onChange={(type) => apply((d) => updateHidden(d, h.name, { type: type as HiddenInput["type"] }))}
              />
              <Pick
                ariaLabel="Source"
                className="w-60"
                value={h.source}
                options={(Object.keys(SOURCE_LABEL) as HiddenInput["source"][]).map((s) => ({ value: s, label: SOURCE_LABEL[s] }))}
                onChange={(source) => apply((d) => updateHidden(d, h.name, { source: source as HiddenInput["source"] }))}
              />
              <Button variant="ghost" size="icon" aria-label="Delete hidden input" onClick={() => apply((d) => removeHidden(d, h.name))}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <Button variant="outline" size="sm" onClick={() => apply((d) => addHidden(d))}>
        <Plus /> Add hidden input
      </Button>
    </section>
  );
}

/** A hidden input's name, renamed on blur or Enter: renaming normalizes it and rewrites its uses. */
function HiddenName({ name, onCommit }: { name: string; onCommit: (name: string) => void }) {
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  return (
    <DraftInput
      ariaLabel="Name"
      value={draft}
      onChange={setDraft}
      onCommit={() => {
        if (draft !== name) onCommit(draft);
        setDraft(name);
      }}
    />
  );
}

/** The whole definition as JSON, editable. Applied only when it parses and passes `parseForm`. */
export function JsonPanel({ def, apply }: { def: FormDefinition; apply: Apply }) {
  const pretty = JSON.stringify(def, null, 2);
  const [text, setText] = useState(pretty);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setText(pretty);
  }, [pretty, dirty]);
  const commit = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return setError("That isn't valid JSON.");
    }
    const result = parseForm(parsed);
    if (!result.ok) return setError(result.issues.map((i) => `${i.path || "form"}: ${i.message}`).join("\n"));
    setError(null);
    setDirty(false);
    apply(() => result.form);
  };
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">The exact definition that is stored and served. Paste a definition here to replace this one.</p>
      <Textarea
        aria-label="Definition JSON"
        data-testid="builder-json"
        className="min-h-96 font-mono text-xs"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
        }}
      />
      {error ? <pre className="whitespace-pre-wrap text-xs text-destructive">{error}</pre> : null}
      <div className="flex gap-2">
        <Button size="sm" disabled={!dirty} onClick={commit} data-testid="builder-json-apply">
          Apply JSON
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!dirty}
          onClick={() => {
            setText(pretty);
            setDirty(false);
            setError(null);
          }}
        >
          Discard
        </Button>
      </div>
    </div>
  );
}
