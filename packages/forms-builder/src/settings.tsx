import { useEffect, useId, useState, type ReactNode } from "react";
import { Flag, Plus, Trash2 } from "lucide-react";
import { parseForm, type FormDefinition, type HiddenInput } from "@marktiderman/genesis-forms";
import { Label } from "@marktiderman/genesis-ui/label";
import { Switch } from "@marktiderman/genesis-ui/switch";
import { Badge } from "@marktiderman/genesis-ui/badge";
import { Button } from "@marktiderman/genesis-ui/button";
import { Textarea } from "@marktiderman/genesis-ui/textarea";
import { DraftInput, Editable, Pick, SelectRow, SwitchRow, TextRow } from "./controls";
import { useBuilderConfig } from "./editors";
import { LogicPanel } from "./logic";
import { FlowMap } from "./flow";
import type { Finding } from "./analyze";
import {
  addEnding,
  addHidden,
  defaultEndingId,
  removeEnding,
  removeHidden,
  updateEnding,
  updateForm,
  updateHidden,
  updateSettings,
  type HiddenSpec,
} from "./ops";

type Apply = (edit: (def: FormDefinition) => FormDefinition, coalesce?: string) => void;

/** "Used by rule 3", "Used by rules 1 and 3": the jumps that finish at an ending. */
function usedBy(def: FormDefinition, endingId: string, isDefault: boolean): string {
  const numbers = (def.logic ?? []).flatMap((r, i) => (r.effect === "jump" && typeof r.to === "object" && r.to.ending === endingId ? [i + 1] : []));
  const list = numbers.length > 1 ? `${numbers.slice(0, -1).join(", ")} and ${numbers.at(-1)}` : String(numbers[0] ?? "");
  const rules = numbers.length ? `rule${numbers.length > 1 ? "s" : ""} ${list}` : "";
  if (isDefault) return rules ? `Used by every path that ends normally, and ${rules}` : "Used by every path that ends normally";
  return rules ? `Used by ${rules}` : "Not used yet: add a jump that finishes here";
}

/**
 * The endings, as cards in a row: title, message, which rules lead there.
 * The default one (the first) is where a form ends when no jump picks another.
 */
export function EndingsPanel({ def, apply, findings }: { def: FormDefinition; apply: Apply; findings: Finding[] }) {
  const endings = def.endings ?? [];
  const readOnly = !!useBuilderConfig().readOnly;
  const id = useId();
  const fallback = defaultEndingId(def);
  return (
    <section className="@container space-y-3" aria-labelledby={`${id}-endings`} data-testid="builder-endings">
      <div>
        <h3 id={`${id}-endings`} className="text-lg font-semibold">
          Endings
        </h3>
        <p className="text-sm text-muted-foreground">What people see after they send. The default shows unless a jump picks another.</p>
      </div>
      <ol className="grid gap-3 @xl:grid-cols-2 @4xl:grid-cols-3" aria-label="Endings">
        {endings.map((e, i) => {
          // Only the reachability check: an untitled ending is flagged too, but it can still be reached.
          const unreachable = findings.some((f) => f.code === "unreachable-ending" && f.ref?.id === e.id);
          const isDefault = e.id === fallback;
          return (
            <li key={e.id} className="flex min-w-0 flex-col gap-1 rounded-xl border bg-card p-4 shadow-sm" data-testid={`builder-ending-${e.id}`}>
              <Editable readOnly={readOnly} className="space-y-1">
                <div className="flex items-center gap-2">
                  <Flag className="size-4 shrink-0 text-primary" aria-hidden />
                  <div className="min-w-0 flex-1">
                  <TextRow
                    label="Title"
                    hideLabel
                    value={e.title}
                    placeholder="Ending title"
                    inputClassName="h-8 border-transparent bg-transparent px-1 text-[0.9375rem] font-semibold shadow-none hover:border-input focus-visible:border-input"
                    onChange={(title) => apply((d) => updateEnding(d, e.id, { title }), `ending-title:${e.id}`)}
                  />
                  </div>
                  {isDefault ? (
                    <Badge variant="muted" className="shrink-0 rounded-md">
                      Default
                    </Badge>
                  ) : null}
                  {readOnly || i === 0 ? null : (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0 text-muted-foreground"
                      aria-label="Delete ending"
                      onClick={() => apply((d) => removeEnding(d, e.id))}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
                <TextRow
                  label="Message"
                  hideLabel
                  multiline
                  rows={1}
                  placeholder="Add a message (optional)"
                  inputClassName="min-h-9 resize-none border-transparent bg-transparent px-1 py-1 text-sm text-muted-foreground shadow-none hover:border-input focus-visible:border-input"
                  value={e.description ?? ""}
                  onChange={(description) => apply((d) => updateEnding(d, e.id, { description }), `ending-desc:${e.id}`)}
                />
              </Editable>
              <p className="mt-auto px-1 pt-1 text-xs text-primary" data-testid={`builder-ending-used-${e.id}`}>
                {usedBy(def, e.id, isDefault)}
              </p>
              {unreachable ? (
                <Badge variant="warning" className="ml-1 rounded-md" data-testid={`builder-ending-unreachable-${e.id}`}>
                  Unreachable
                </Badge>
              ) : null}
            </li>
          );
        })}
        {readOnly ? null : (
          <li className="flex">
            <Button
              variant="outline"
              className="h-auto min-h-24 w-full flex-1 border-dashed bg-transparent shadow-none"
              onClick={() => apply((d) => addEnding(d))}
              data-testid="builder-add-ending"
            >
              <Plus /> Add ending
            </Button>
          </li>
        )}
      </ol>
    </section>
  );
}

/**
 * Logic and endings in one panel: the rules, then the endings they can send
 * people to, with the flow map beside them (under them in a narrow
 * container). What the builder shows under "Logic and endings"; a host with
 * its own tabs can render it as one tab. `aside` goes under the flow map,
 * where the builder puts its checks.
 */
export function LogicAndEndingsPanel({
  def,
  apply,
  findings,
  aside,
  flow = true,
}: {
  def: FormDefinition;
  apply: Apply;
  findings: Finding[];
  aside?: ReactNode;
  /** Show the flow map beside the rules. The builder puts it over its own preview instead. Default true. */
  flow?: boolean;
}) {
  const main = (
    <div className="min-w-0 space-y-10">
      <LogicPanel def={def} apply={apply} findings={findings} />
      <EndingsPanel def={def} apply={apply} findings={findings} />
    </div>
  );
  if (!flow && !aside) return <div data-testid="builder-logic-endings">{main}</div>;
  return (
    <div className="@container" data-testid="builder-logic-endings">
      <div className="grid items-start gap-6 @min-[52rem]:grid-cols-[minmax(0,1fr)_20rem] @min-[72rem]:grid-cols-[minmax(0,1fr)_24rem]">
        {main}
        <div className="min-w-0 space-y-4 @min-[52rem]:sticky @min-[52rem]:top-4">
          {flow ? <FlowMap def={def} findings={findings} /> : null}
          {aside}
        </div>
      </div>
    </div>
  );
}

export function SettingsPanel({
  def,
  apply,
  formHeading = true,
}: {
  def: FormDefinition;
  apply: Apply;
  /** Show the "Form" heading over the first section. Off when a host's own card already titles it. Default true. */
  formHeading?: boolean;
}) {
  const readOnly = !!useBuilderConfig().readOnly;
  return (
    <Editable readOnly={readOnly} className="space-y-6">
      <section className="space-y-4">
        {formHeading ? <h3 className="text-sm font-semibold">Form</h3> : null}
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
          hint="Questions marked “identifies the respondent” are not asked or stored. Hidden inputs marked so are not stored (logic can still read them)."
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
      <HiddenInputsSection def={def} apply={apply} readOnly={readOnly} />
    </Editable>
  );
}

const SOURCE_LABEL: Record<HiddenInput["source"], string> = {
  url: "From the link (?name=…)",
  host: "From the app showing the form",
  server: "Set by the server (trusted)",
};

function HiddenInputsSection({ def, apply, readOnly }: { def: FormDefinition; apply: Apply; readOnly: boolean }) {
  const hidden: HiddenSpec[] = def.hidden ?? [];
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Hidden inputs</h3>
        <p className="text-xs text-muted-foreground">
          Values the respondent doesn't type, such as a location, a staff member or an account id. Use them in logic, or in wording with{" "}
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
                {/* Renamed on blur or Enter: renaming normalizes it and rewrites its uses. */}
                <DraftInput ariaLabel="Name" value={h.name} onCommit={(name) => apply((d) => updateHidden(d, h.name, { name }))} />
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
              {readOnly ? null : (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete hidden input ${h.name}`}
                  onClick={() => apply((d) => removeHidden(d, h.name))}
                >
                  <Trash2 />
                </Button>
              )}
              <div className="flex w-full flex-wrap gap-4">
                <InlineSwitch
                  label="Sensitive"
                  checked={!!h.sensitive}
                  onChange={(sensitive) => apply((d) => updateHidden(d, h.name, { sensitive }))}
                />
                <InlineSwitch
                  label="Identifies the respondent"
                  checked={!!h.identifying}
                  testID={`builder-hidden-identifying-${i}`}
                  onChange={(identifying) => apply((d) => updateHidden(d, h.name, { identifying }))}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {readOnly ? null : (
        <Button variant="outline" size="sm" onClick={() => apply((d) => addHidden(d))}>
          <Plus /> Add hidden input
        </Button>
      )}
    </section>
  );
}

function InlineSwitch(props: { label: string; checked: boolean; onChange: (checked: boolean) => void; testID?: string }) {
  return (
    <Label className="flex items-center gap-2 text-xs font-normal">
      <Switch checked={props.checked} onCheckedChange={props.onChange} data-testid={props.testID} />
      {props.label}
    </Label>
  );
}

/** The whole definition as JSON, editable. Applied only when it parses and passes `parseForm`. */
export function JsonPanel({ def, apply }: { def: FormDefinition; apply: Apply }) {
  const readOnly = !!useBuilderConfig().readOnly;
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
      <p className="text-sm text-muted-foreground">
        {readOnly
          ? "The exact definition that is stored and served."
          : "The exact definition that is stored and served. Paste a definition here to replace this one."}
      </p>
      <Textarea
        aria-label="Definition JSON"
        data-testid="builder-json"
        className="min-h-96 font-mono text-xs"
        // Read-only, not disabled, so it can still be selected and copied.
        readOnly={readOnly}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
        }}
      />
      {error ? <pre className="whitespace-pre-wrap text-xs text-destructive">{error}</pre> : null}
      {readOnly ? null : (
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
      )}
    </div>
  );
}
