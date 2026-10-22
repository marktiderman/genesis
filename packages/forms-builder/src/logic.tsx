import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import {
  choiceOptions,
  describeCondition,
  parseForm,
  type Block,
  type Condition,
  type FieldBlock,
  type FormDefinition,
  type HiddenInput,
  type Json,
  type LogicRule,
  type Operand,
  type Operator,
} from "@marktiderman/genesis-forms";
import { Badge } from "@marktiderman/genesis-ui/badge";
import { Button } from "@marktiderman/genesis-ui/button";
import { Input } from "@marktiderman/genesis-ui/input";
import { Textarea } from "@marktiderman/genesis-ui/textarea";
import { cn } from "@marktiderman/genesis-ui/utils";
import { DraftInput, Pick, SelectRow, useDraft, type Choice } from "./controls";
import type { Finding } from "./analyze";
import {
  addRule,
  defaultEndingId,
  HIDDEN_OPERATORS,
  moveRule,
  newId,
  operatorsFor,
  removeRule,
  starterCondition,
  starterValue,
  UNARY_OPERATORS,
  updateRule,
  type FieldTypeDefaults,
} from "./ops";

import { editorFor, useBuilderConfig, type Apply } from "./editors";

export const OPERATOR_LABEL: Record<Operator, string> = {
  eq: "is",
  neq: "is not",
  lt: "is less than",
  lte: "is at most",
  gt: "is more than",
  gte: "is at least",
  in: "is one of",
  contains: "includes",
  answered: "is answered",
  empty: "is not answered",
};

type Comparison = Extract<Condition, { op: Operator }>;

const fieldsOf = (def: FormDefinition) => def.blocks.filter((b): b is FieldBlock => b.kind === "field");

const blockLabel = (b: Block) =>
  b.kind === "field" ? b.label || b.key : b.kind === "content" ? b.text.slice(0, 40) || b.type : b.title || "Page break";

/** A condition the clause editor can show: one comparison, or `all` / `any` of comparisons. */
function flatten(condition: Condition): { mode: "all" | "any"; clauses: Comparison[] } | null {
  if ("op" in condition) return { mode: "all", clauses: [condition] };
  const list = "all" in condition ? condition.all : "any" in condition ? condition.any : null;
  if (!list || !list.every((c): c is Comparison => "op" in c)) return null;
  return { mode: "all" in condition ? "all" : "any", clauses: list };
}

function join(mode: "all" | "any", clauses: Comparison[]): Condition {
  if (clauses.length === 1) return clauses[0]!;
  return mode === "all" ? { all: clauses } : { any: clauses };
}

export function describeRule(rule: LogicRule, def: FormDefinition): string {
  const name = (id: string) => {
    const b = def.blocks.find((x) => x.id === id);
    return b ? `"${blockLabel(b)}"` : id;
  };
  const when = describeCondition(rule.when, def);
  if (rule.effect === "jump") {
    const to =
      typeof rule.to === "string"
        ? name(rule.to)
        : `the ending "${def.endings?.find((e) => e.id === (rule.to as { ending: string }).ending)?.title ?? rule.to.ending}"`;
    return `After ${name(rule.from)}, go to ${to} when ${when}`;
  }
  return rule.effect === "show" ? `Show ${name(rule.target)} only when ${when}` : `Hide ${name(rule.target)} when ${when}`;
}

/**
 * A new show rule: show the last field when the first one is answered a
 * certain way. A jump goes to the next step, else the default ending; null
 * when there is nothing to jump to.
 */
export function starterRule(
  def: FormDefinition,
  effect: LogicRule["effect"] = "show",
  editors?: readonly FieldTypeDefaults[],
): LogicRule | null {
  const fields = fieldsOf(def);
  const source = fields[0];
  if (!source) return null;
  const id = newId("rule");
  if (effect === "jump") {
    const later = def.blocks.slice(def.blocks.indexOf(source) + 1).find((b) => b.kind !== "page-break");
    const ending = defaultEndingId(def);
    if (!later && !ending) return null;
    return {
      id,
      effect: "jump",
      when: starterCondition(source, editors),
      from: source.id,
      to: later ? later.id : { ending: ending! },
    };
  }
  const target = fields.at(-1) !== source ? fields.at(-1)! : def.blocks.find((b) => b.id !== source.id && b.kind !== "page-break");
  if (!target) return null;
  return { id, effect, when: starterCondition(source, editors), target: target.id };
}

export function LogicPanel({ def, apply, findings }: { def: FormDefinition; apply: Apply; findings: Finding[] }) {
  const rules = def.logic ?? [];
  const [open, setOpen] = useState<string | null>(null);
  const config = useBuilderConfig();
  const add = (effect: LogicRule["effect"]) => {
    const rule = starterRule(def, effect, config.fieldEditors);
    if (!rule) return;
    apply((d) => addRule(d, rule));
    setOpen(rule.id);
  };
  const canAdd = fieldsOf(def).length > 0 && def.blocks.length > 1;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Rules run in order. <strong>Show/hide</strong> rules decide whether a question is asked; <strong>jump</strong> rules
        skip ahead after a question, or finish the form at an ending.
      </p>
      {rules.length ? (
        <ol className="space-y-2" aria-label="Rules">
          {rules.map((rule, index) => {
            const ruleFindings = findings.filter((f) => f.ref?.kind === "rule" && f.ref.id === rule.id);
            const isOpen = open === rule.id;
            return (
              <li key={rule.id} className={cn("rounded-lg border bg-card", isOpen && "ring-2 ring-ring")} data-testid={`builder-rule-${rule.id}`}>
                <div className="flex items-center gap-2 p-3">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left text-sm"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : rule.id)}
                  >
                    <Badge variant={rule.effect === "jump" ? "info" : "secondary"} className="mr-2">
                      {rule.effect}
                    </Badge>
                    {describeRule(rule, def)}
                  </button>
                  {ruleFindings.length ? <Badge variant="warning">{ruleFindings.length}</Badge> : null}
                  <Button variant="ghost" size="icon" aria-label="Move rule up" disabled={index === 0} onClick={() => apply((d) => moveRule(d, rule.id, index - 1))}>
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Move rule down"
                    disabled={index === rules.length - 1}
                    onClick={() => apply((d) => moveRule(d, rule.id, index + 1))}
                  >
                    <ArrowDown />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Delete rule" onClick={() => apply((d) => removeRule(d, rule.id))}>
                    <Trash2 />
                  </Button>
                </div>
                {isOpen ? (
                  <div className="space-y-4 border-t p-4">
                    {ruleFindings.map((f, i) => (
                      <p key={i} className="rounded-md bg-warning/15 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                        {f.message}
                      </p>
                    ))}
                    <RuleEditor def={def} rule={rule} onChange={(next) => apply((d) => updateRule(d, rule.id, next))} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No rules: every question is asked, in order.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={!canAdd} onClick={() => add("show")} data-testid="builder-add-rule-show">
          <Plus /> Show/hide rule
        </Button>
        <Button variant="outline" size="sm" disabled={!canAdd} onClick={() => add("jump")} data-testid="builder-add-rule-jump">
          <Plus /> Jump rule
        </Button>
      </div>
    </div>
  );
}

export function RuleEditor({ def, rule, onChange }: { def: FormDefinition; rule: LogicRule; onChange: (rule: LogicRule) => void }) {
  const blocks = def.blocks;
  const steps = blocks.filter((b) => b.kind !== "page-break");
  const effectOptions: Choice[] = [
    { value: "show", label: "Show a question only when…" },
    { value: "hide", label: "Hide a question when…" },
    { value: "jump", label: "Jump after a question when…" },
  ];

  const setEffect = (effect: string) => {
    if (effect === rule.effect) return;
    if (effect === "jump") {
      const from = rule.effect === "jump" ? rule.from : (steps.find((b) => b.kind === "field")?.id ?? steps[0]?.id ?? "");
      // The default ending, or with none (a form without endings) the next step.
      const ending = defaultEndingId(def);
      const next = steps[steps.findIndex((b) => b.id === from) + 1];
      const to = ending ? { ending } : next?.id;
      if (to === undefined) return;
      onChange({ id: rule.id, effect: "jump", when: rule.when, from, to });
    } else {
      const target = rule.effect === "jump" ? (steps.at(-1)?.id ?? "") : rule.target;
      onChange({ id: rule.id, effect: effect as "show" | "hide", when: rule.when, target });
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectRow label="This rule" value={rule.effect} options={effectOptions} onChange={setEffect} />
        {rule.effect === "jump" ? (
          <SelectRow
            label="After"
            value={rule.from}
            options={steps.map((b) => ({ value: b.id, label: blockLabel(b) }))}
            onChange={(from) => onChange({ ...rule, from })}
          />
        ) : (
          <SelectRow
            label={rule.effect === "show" ? "Show" : "Hide"}
            value={rule.target}
            options={steps.map((b) => ({ value: b.id, label: blockLabel(b) }))}
            onChange={(target) => onChange({ ...rule, target })}
          />
        )}
      </div>
      {rule.effect === "jump" ? (
        <SelectRow
          label="Go to"
          value={typeof rule.to === "string" ? `block:${rule.to}` : `ending:${rule.to.ending}`}
          options={[
            ...steps.slice(steps.findIndex((b) => b.id === rule.from) + 1).map((b) => ({ value: `block:${b.id}`, label: blockLabel(b) })),
            ...(def.endings ?? []).map((e) => ({ value: `ending:${e.id}`, label: `End: ${e.title}` })),
          ]}
          hint="A jump only moves forward: earlier questions are not offered."
          onChange={(v) =>
            onChange({ ...rule, to: v.startsWith("ending:") ? { ending: v.slice("ending:".length) } : v.slice("block:".length) })
          }
        />
      ) : null}
      <ConditionEditor def={def} rule={rule} condition={rule.when} onChange={(when) => onChange({ ...rule, when })} />
    </div>
  );
}

/** Which questions a rule may read: those before the block it applies to, and every hidden input. */
function readableFields(def: FormDefinition, rule: LogicRule): FieldBlock[] {
  const at = def.blocks.findIndex((b) => b.id === (rule.effect === "jump" ? rule.from : rule.target));
  const limit = rule.effect === "jump" ? at + 1 : at;
  return fieldsOf(def).filter((f) => {
    const i = def.blocks.indexOf(f);
    return limit < 0 || i < limit;
  });
}

export function ConditionEditor({
  def,
  rule,
  condition,
  onChange,
}: {
  def: FormDefinition;
  rule: LogicRule;
  condition: Condition;
  onChange: (condition: Condition) => void;
}) {
  const { fieldEditors } = useBuilderConfig();
  const flat = flatten(condition);
  const fields = readableFields(def, rule);
  const hidden = def.hidden ?? [];
  if (!flat) return <ConditionJson def={def} rule={rule} condition={condition} onChange={onChange} />;
  const { mode, clauses } = flat;
  const setClause = (i: number, c: Comparison) => onChange(join(mode, clauses.map((x, j) => (j === i ? c : x))));
  const first = fields[0];
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 flex items-center gap-2 text-sm font-medium">
        When
        {clauses.length > 1 ? (
          <Pick
            ariaLabel="Match"
            className="h-8 w-auto"
            value={mode}
            options={[
              { value: "all", label: "all of these are true" },
              { value: "any", label: "any of these is true" },
            ]}
            onChange={(m) => onChange(join(m as "all" | "any", clauses))}
          />
        ) : null}
      </legend>
      {clauses.map((clause, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2" data-testid={`builder-clause-${i}`}>
          <ClauseEditor def={def} fields={fields} hidden={hidden} clause={clause} onChange={(c) => setClause(i, c)} />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Remove condition"
            disabled={clauses.length === 1}
            onClick={() => onChange(join(mode, clauses.filter((_, j) => j !== i)))}
          >
            <X />
          </Button>
        </div>
      ))}
      {first ? (
        <Button variant="ghost" size="sm" onClick={() => onChange(join(mode, [...clauses, starterCondition(first, fieldEditors) as Comparison]))}>
          <Plus /> Add condition
        </Button>
      ) : null}
      {!fields.length && !hidden.length ? (
        <p className="text-xs text-muted-foreground">Logic can only read questions that come before the one it applies to.</p>
      ) : null}
    </fieldset>
  );
}

function ClauseEditor({
  def,
  fields,
  hidden,
  clause,
  onChange,
}: {
  def: FormDefinition;
  fields: FieldBlock[];
  hidden: HiddenInput[];
  clause: Comparison;
  onChange: (c: Comparison) => void;
}) {
  const leftKey = "field" in clause.left ? `field:${clause.left.field}` : "hidden" in clause.left ? `hidden:${clause.left.hidden}` : "";
  const field = "field" in clause.left ? def.blocks.find((b): b is FieldBlock => b.kind === "field" && b.id === (clause.left as { field: string }).field) : undefined;
  const input = "hidden" in clause.left ? hidden.find((h) => h.name === (clause.left as { hidden: string }).hidden) : undefined;
  const ops: Operator[] = field ? operatorsFor(field.type) : input ? HIDDEN_OPERATORS[input.type] : ["answered", "empty"];
  const { fieldEditors } = useBuilderConfig();

  const leftOptions: Choice[] = [
    ...fields.map((f) => ({ value: `field:${f.id}`, label: f.label || f.key })),
    ...hidden.map((h) => ({ value: `hidden:${h.name}`, label: `Hidden: ${h.name}` })),
  ];
  if (leftKey && !leftOptions.some((o) => o.value === leftKey)) leftOptions.unshift({ value: leftKey, label: "(not before this question)" });

  const setLeft = (v: string) => {
    if (v.startsWith("field:")) {
      const f = fields.find((x) => x.id === v.slice(6));
      if (f) onChange(starterCondition(f, fieldEditors) as Comparison);
    } else {
      const h = hidden.find((x) => x.name === v.slice(7));
      if (h) {
        const op = HIDDEN_OPERATORS[h.type][0]!;
        onChange({ op, left: { hidden: h.name }, right: { value: h.type === "boolean" ? true : h.type === "number" ? 0 : "" } });
      }
    }
  };
  const setOp = (op: Operator) => {
    if (UNARY_OPERATORS.has(op)) return onChange({ op, left: clause.left });
    const current = clause.right && "value" in clause.right ? clause.right.value : undefined;
    let value: Json = current ?? (field ? starterValue(field, op, fieldEditors) : "");
    if (op === "in" && !Array.isArray(value)) value = value === "" ? [] : [value];
    if (op !== "in" && Array.isArray(value)) value = value[0] ?? "";
    onChange({ op, left: clause.left, right: { value } });
  };

  return (
    <>
      <Pick ariaLabel="Question" className="h-9 w-48" value={leftKey} options={leftOptions} onChange={setLeft} />
      <Pick
        ariaLabel="Comparison"
        className="h-9 w-40"
        value={clause.op}
        options={ops.map((o) => ({ value: o, label: OPERATOR_LABEL[o] }))}
        onChange={(o) => setOp(o as Operator)}
      />
      {UNARY_OPERATORS.has(clause.op) ? null : (
        <ValueEditor
          field={field}
          input={input}
          op={clause.op}
          value={clause.right && "value" in clause.right ? clause.right.value : null}
          onChange={(value) => onChange({ ...clause, right: { value } as Operand })}
        />
      )}
    </>
  );
}

function ValueEditor({
  field,
  input,
  op,
  value,
  onChange,
}: {
  field: FieldBlock | undefined;
  input: HiddenInput | undefined;
  op: Operator;
  value: Json;
  onChange: (value: Json) => void;
}) {
  const config = useBuilderConfig();
  const Custom = field ? editorFor(config, field.type)?.ConditionValue : undefined;
  if (field && Custom) return <Custom field={field} op={op} value={value} onChange={onChange} />;
  const boolean = field?.type === "yes-no" || input?.type === "boolean";
  if (boolean) {
    return (
      <Pick
        ariaLabel="Value"
        className="h-9 w-28"
        value={value === false ? "false" : "true"}
        options={[
          { value: "true", label: "Yes" },
          { value: "false", label: "No" },
        ]}
        onChange={(v) => onChange(v === "true")}
      />
    );
  }
  const options = field ? choiceOptions(field) : [];
  if (options.length) {
    if (op === "in") {
      const picked = new Set(Array.isArray(value) ? value.map(String) : []);
      return (
        <div className="flex flex-wrap gap-1" role="group" aria-label="Values">
          {options.map((o) => {
            const on = picked.has(o.value);
            return (
              <Button
                key={o.value}
                type="button"
                size="sm"
                variant={on ? "default" : "outline"}
                aria-pressed={on}
                onClick={() => {
                  const next = new Set(picked);
                  on ? next.delete(o.value) : next.add(o.value);
                  onChange(options.map((x) => x.value).filter((v) => next.has(v)));
                }}
              >
                {o.label ?? o.value}
              </Button>
            );
          })}
        </div>
      );
    }
    return (
      <Pick
        ariaLabel="Value"
        className="h-9 w-44"
        value={typeof value === "string" ? value : ""}
        options={options.map((o) => ({ value: o.value, label: o.label ?? o.value }))}
        onChange={onChange}
      />
    );
  }
  const numeric = field ? field.type === "rating" || field.type === "nps" : input?.type === "number";
  if (op === "in") {
    // "is one of" needs a list: comma-separated values, numbers for numeric questions.
    const list = Array.isArray(value) ? value : [];
    return (
      <ListInput
        numeric={numeric}
        value={list.map(String).join(", ")}
        onChange={(text) => {
          const parts = text.split(",").map((t) => t.trim()).filter(Boolean);
          onChange(numeric ? parts.map(Number).filter((n) => Number.isFinite(n)) : parts);
        }}
      />
    );
  }
  if (numeric) {
    // Committed on blur: clearing the box to type another number leaves the rule as it was.
    return (
      <DraftInput
        ariaLabel="Value"
        type="number"
        className="h-9 w-24"
        value={typeof value === "number" ? String(value) : ""}
        onCommit={(raw) => {
          const n = Number(raw);
          if (raw.trim() !== "" && Number.isFinite(n)) onChange(n);
        }}
      />
    );
  }
  return (
    <Input
      aria-label="Value"
      className="h-9 w-44"
      value={typeof value === "string" ? value : value == null ? "" : String(value)}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** Comma-separated values, kept as typed until blur so "1, " isn't cut back to "1". */
function ListInput({ value, numeric, onChange }: { value: string; numeric: boolean; onChange: (text: string) => void }) {
  const { draft, setDraft, commit } = useDraft(value, onChange);
  return (
    <Input
      aria-label="Values"
      className="h-9 w-44"
      inputMode={numeric ? "numeric" : "text"}
      placeholder={numeric ? "1, 2, 3" : "a, b, c"}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
    />
  );
}

/** For conditions the clause editor can't show (nested groups, `not`): edit the JSON. */
function ConditionJson({
  def,
  rule,
  condition,
  onChange,
}: {
  def: FormDefinition;
  rule: LogicRule;
  condition: Condition;
  onChange: (c: Condition) => void;
}) {
  const pretty = JSON.stringify(condition, null, 2);
  const [text, setText] = useState(pretty);
  const [error, setError] = useState<string | null>(null);
  // Text not applied yet (not valid JSON or not a valid condition): an outside change must not wipe it.
  const [dirty, setDirty] = useState(false);
  // The condition this box last showed or sent; anything else came from outside (undo, redo).
  const known = useRef(pretty);
  useEffect(() => {
    if (pretty === known.current) return;
    known.current = pretty;
    if (!dirty) {
      setText(pretty);
      setError(null);
    }
  }, [dirty, pretty]);
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">When (advanced)</p>
      <Textarea
        aria-label="Condition JSON"
        className="font-mono text-xs"
        rows={8}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
          try {
            const raw: unknown = JSON.parse(e.target.value);
            // A condition is an object; null, a number or a list would crash the clause editor.
            if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
              setError("A condition is an object, such as {\"all\": [...]}.");
              return;
            }
            const parsed = raw as Condition;
            // Checked in this form, so the fields and hidden inputs it names resolve.
            const check = parseForm({ ...def, logic: [{ ...rule, when: parsed }] });
            const conditionIssue = !check.ok && check.issues.find((i) => i.path.startsWith("logic[0]"));
            setError(conditionIssue ? conditionIssue.message : null);
            if (!conditionIssue) {
              known.current = JSON.stringify(parsed, null, 2);
              setDirty(false);
              onChange(parsed);
            }
          } catch {
            setError("Not valid JSON yet.");
          }
        }}
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <p className="text-xs text-muted-foreground">This condition has nested groups, so it is shown as JSON.</p>
    </div>
  );
}
