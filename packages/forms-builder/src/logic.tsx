import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowRight, ArrowUp, Ellipsis, Eye, EyeOff, Flag, Plus, Trash2, X } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@marktiderman/genesis-ui/dropdown-menu";
import { SortableList } from "@marktiderman/genesis-ui/patterns";
import { cn } from "@marktiderman/genesis-ui/utils";
import { DraftInput, Editable, Pick, SelectRow, useDraft, type Choice } from "./controls";
import type { Finding } from "./analyze";
import {
  addRule,
  conditionFields,
  defaultEndingId,
  HIDDEN_OPERATORS,
  moveRule,
  freshId,
  operatorsFor,
  removeRule,
  starterCondition,
  starterValue,
  UNARY_OPERATORS,
  updateRule,
  type FieldTypeDefaults,
} from "./ops";

import { editorFor, useBuilderConfig, type Apply } from "./editors";
import { BlockIcon } from "./type-icons";

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
 * Where a new jump after block `from` goes: the next step, else the default
 * ending; null when there is neither. Pure: it makes no ids.
 */
export function jumpTarget(def: FormDefinition, from: string): Extract<LogicRule, { effect: "jump" }>["to"] | null {
  const at = def.blocks.findIndex((b) => b.id === from);
  const later = at === -1 ? undefined : def.blocks.slice(at + 1).find((b) => b.kind !== "page-break");
  if (later) return later.id;
  const ending = defaultEndingId(def);
  return ending ? { ending } : null;
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
  if (effect === "jump") {
    const to = jumpTarget(def, source.id);
    if (!to) return null;
    return { id: freshId("rule", def), effect: "jump", when: starterCondition(source, editors), from: source.id, to };
  }
  const target = fields.at(-1) !== source ? fields.at(-1)! : def.blocks.find((b) => b.id !== source.id && b.kind !== "page-break");
  if (!target) return null;
  return { id: freshId("rule", def), effect, when: starterCondition(source, editors), target: target.id };
}

/**
 * The value a comparison keeps when its operator changes to `op`. Built-in
 * types switch between a list ("is one of") and a single value. A type whose
 * field editor defines `starterValue` owns its value shape and gets that for
 * the new operator; any other editor (a Panel only, say) gets the switch.
 */
export function valueForOperator(
  field: FieldBlock | undefined,
  op: Operator,
  current: Json | undefined,
  editors?: readonly FieldTypeDefaults[],
): Json {
  const editor = field ? editors?.find((e) => e.type === field.type) : undefined;
  if (field && editor?.starterValue) return editor.starterValue(field, op);
  let value: Json = current ?? (field ? starterValue(field, op, editors) : "");
  if (op === "in" && !Array.isArray(value)) value = value === "" ? [] : [value];
  if (op !== "in" && Array.isArray(value)) value = value[0] ?? "";
  return value;
}

/** The inline picker pill of a rule sentence. */
export const PILL = "h-8 w-auto max-w-64 gap-1.5 rounded-md border-input bg-muted/40 px-2.5 text-sm font-medium focus:ring-offset-0";
/** A pill for where a jump goes: tinted like an ending, so the destination stands out. */
const TARGET_PILL = cn(PILL, "border-primary/30 bg-primary/10 text-primary");

const KIND: Record<LogicRule["effect"], { label: string; className: string; Icon: typeof ArrowRight }> = {
  jump: { label: "Jump", className: "bg-violet-500/10 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300", Icon: ArrowRight },
  show: { label: "Show only when", className: "bg-warning/15 text-amber-800 dark:bg-warning/20 dark:text-amber-200", Icon: Eye },
  hide: { label: "Hide when", className: "bg-warning/15 text-amber-800 dark:bg-warning/20 dark:text-amber-200", Icon: EyeOff },
};

/** The chip naming a rule's kind: Jump (violet), Show only when / Hide when (amber). */
export function RuleKindChip({ effect }: { effect: LogicRule["effect"] }) {
  const { label, className, Icon } = KIND[effect];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium", className)} data-kind={effect}>
      <Icon className="size-3" aria-hidden />
      {label}
    </span>
  );
}

/**
 * The rules, as cards that read as sentences ("If [question] [is at most] [2]
 * go to [What went wrong?]"), in the order they run. Drag a card by its grip
 * or move it from the keyboard; its menu changes its kind, moves or deletes it.
 */
export function LogicPanel({ def, apply, findings }: { def: FormDefinition; apply: Apply; findings: Finding[] }) {
  const rules = def.logic ?? [];
  const config = useBuilderConfig();
  const readOnly = !!config.readOnly;
  const id = useId();
  const add = (effect: LogicRule["effect"]) => {
    const rule = starterRule(def, effect, config.fieldEditors);
    if (!rule) return;
    apply((d) => addRule(d, rule));
  };
  const canAdd = fieldsOf(def).length > 0 && def.blocks.length > 1;
  // A jump needs somewhere to go: a later step, or an ending.
  // Checked without building a rule, so a render never asks the host's id generator.
  const firstField = fieldsOf(def)[0];
  const canJump = canAdd && !!firstField && jumpTarget(def, firstField.id) !== null;
  return (
    <section className="space-y-3" aria-labelledby={`${id}-rules`} data-testid="builder-rules">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-48 flex-1">
          <h3 id={`${id}-rules`} className="text-lg font-semibold">
            Rules
          </h3>
          <p className="text-sm text-muted-foreground">They run top to bottom. The first matching jump wins.</p>
        </div>
        {readOnly ? null : (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={!canAdd} onClick={() => add("show")} data-testid="builder-add-rule-show">
              <EyeOff /> Show or hide a question
            </Button>
            <Button size="sm" disabled={!canJump} onClick={() => add("jump")} data-testid="builder-add-rule-jump">
              <ArrowRight /> Add a jump
            </Button>
          </div>
        )}
      </div>
      {!readOnly && canAdd && !canJump ? (
        <p className="text-xs text-muted-foreground" data-testid="builder-jump-hint">
          A jump needs a later question or an ending to go to. Add an ending (or a question after the first one) to make one.
        </p>
      ) : null}
      {rules.length ? (
        <SortableList
          items={rules}
          getKey={(r) => r.id}
          getItemLabel={(r) => `Rule ${rules.indexOf(r) + 1}`}
          label="Rules"
          disabled={readOnly}
          // Each card's own menu moves it up and down.
          moveMenu={false}
          className="gap-3"
          onReorder={(_from, to, { key }) => apply((d) => moveRule(d, key, to))}
          renderItem={(rule, { index, handle, isGrabbed }) => (
            <RuleCard
              def={def}
              rule={rule}
              index={index}
              count={rules.length}
              handle={handle}
              grabbed={isGrabbed}
              findings={findings.filter((f) => f.ref?.kind === "rule" && f.ref.id === rule.id)}
              apply={apply}
            />
          )}
        />
      ) : (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No rules: every question is asked, in order.</p>
      )}
      {readOnly || !canAdd ? null : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-10 w-full border-dashed bg-transparent shadow-none" data-testid="builder-add-rule">
              <Plus /> Add a rule
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center">
            <DropdownMenuItem disabled={!canJump} onSelect={() => add("jump")}>
              <ArrowRight /> Jump to a question or an ending
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => add("show")}>
              <Eye /> Show a question only when…
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => add("hide")}>
              <EyeOff /> Hide a question when…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </section>
  );
}

/** Where a show/hide rule turned into a jump goes: after the question it reads, to the next step, else the default ending. */
function asJump(def: FormDefinition, rule: LogicRule): LogicRule | null {
  if (rule.effect === "jump") return rule;
  const read = [...conditionFields(rule.when)];
  const steps = def.blocks.filter((b) => b.kind !== "page-break");
  const from = read[0] ?? steps.find((b) => b.kind === "field")?.id;
  if (!from) return null;
  const to = jumpTarget(def, from);
  return to ? { id: rule.id, effect: "jump", when: rule.when, from, to } : null;
}

function RuleCard({
  def,
  rule,
  index,
  count,
  handle,
  grabbed,
  findings,
  apply,
}: {
  def: FormDefinition;
  rule: LogicRule;
  index: number;
  count: number;
  handle: ReactNode;
  grabbed: boolean;
  findings: Finding[];
  apply: Apply;
}) {
  const readOnly = !!useBuilderConfig().readOnly;
  const change = (next: LogicRule) => apply((d) => updateRule(d, rule.id, next));
  const steps = def.blocks.filter((b) => b.kind !== "page-break");
  const setEffect = (effect: LogicRule["effect"]) => {
    if (effect === rule.effect) return;
    if (effect === "jump") {
      const jump = asJump(def, rule);
      if (jump) change(jump);
      return;
    }
    // A jump turned into show/hide applies to the step after the one it jumped from.
    const target = rule.effect === "jump" ? (steps[steps.findIndex((b) => b.id === rule.from) + 1]?.id ?? steps.at(-1)?.id ?? "") : rule.target;
    change({ id: rule.id, effect, when: rule.when, target });
  };
  const canJump = rule.effect === "jump" || asJump(def, rule) !== null;
  return (
    <div
      className={cn("rounded-xl border bg-card px-4 py-3.5 shadow-sm", grabbed && "shadow-md", findings.length && "border-warning/60")}
      data-testid={`builder-rule-${rule.id}`}
    >
      <div className="flex items-center gap-2">
        {handle}
        <span className="text-sm font-medium text-muted-foreground">Rule {index + 1}</span>
        <RuleKindChip effect={rule.effect} />
        {findings.length ? (
          <Badge variant="warning" className="px-1.5">
            {findings.length}
          </Badge>
        ) : null}
        <span className="flex-1" />
        {readOnly ? null : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label={`Actions for rule ${index + 1}`}>
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(["jump", "show", "hide"] as const)
                .filter((e) => e !== rule.effect)
                .map((e) => (
                  <DropdownMenuItem key={e} disabled={e === "jump" && !canJump} onSelect={() => setEffect(e)}>
                    Make it {e === "jump" ? "a jump" : e === "show" ? "“show only when”" : "“hide when”"}
                  </DropdownMenuItem>
                ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={index === 0} onSelect={() => apply((d) => moveRule(d, rule.id, index - 1))}>
                <ArrowUp /> Move up
              </DropdownMenuItem>
              <DropdownMenuItem disabled={index === count - 1} onSelect={() => apply((d) => moveRule(d, rule.id, index + 1))}>
                <ArrowDown /> Move down
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => apply((d) => removeRule(d, rule.id))}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {findings.map((f, i) => (
        <p key={i} className="mt-2 rounded-md bg-warning/15 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          {f.message}
        </p>
      ))}
      <Editable readOnly={readOnly} className="mt-2.5">
        <RuleSentence def={def} rule={rule} onChange={change} />
      </Editable>
    </div>
  );
}

const Word = ({ children }: { children: ReactNode }) => <span className="text-sm text-muted-foreground">{children}</span>;

/**
 * One rule as a sentence of picker pills. A jump whose condition reads only
 * the question it jumps after reads "If [question] [is] [value] go to
 * [target]", and picking another question moves the jump there too; any
 * other jump reads "After [question], if … go to [target]".
 */
export function RuleSentence({ def, rule, onChange }: { def: FormDefinition; rule: LogicRule; onChange: (rule: LogicRule) => void }) {
  const config = useBuilderConfig();
  const steps = def.blocks.filter((b) => b.kind !== "page-break");
  const stepChoice = (b: Block): Choice => ({ value: b.id, label: blockLabel(b), icon: <BlockIcon block={b} config={config} className="size-3.5" /> });
  const when = (
    <ConditionEditor
      def={def}
      rule={rule}
      condition={rule.when}
      inline
      linkedJump={rule.effect === "jump" && linkedField(rule) !== null}
      onChange={(next) => onChange({ ...rule, when: next })}
      onRelink={
        rule.effect === "jump"
          ? (field) => {
              // The jump follows the question its condition reads; a target no longer after it moves on.
              const to = typeof rule.to === "object" || isAfter(def, rule.to, field.id) ? rule.to : jumpTarget(def, field.id);
              if (to) onChange({ ...rule, from: field.id, to, when: starterCondition(field, config.fieldEditors) });
            }
          : undefined
      }
    />
  );

  if (rule.effect !== "jump") {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2" data-testid="builder-rule-sentence">
        <Word>{rule.effect === "show" ? "Show" : "Hide"}</Word>
        <Pick ariaLabel={rule.effect === "show" ? "Show" : "Hide"} className={PILL} value={rule.target} options={steps.map(stepChoice)} onChange={(target) => onChange({ ...rule, target })} />
        <Word>{rule.effect === "show" ? "only when" : "when"}</Word>
        {when}
      </div>
    );
  }

  const later = steps.slice(steps.findIndex((b) => b.id === rule.from) + 1);
  const targets: Choice[] = [
    ...later.map(stepChoice),
    ...(def.endings ?? []).map((e) => ({ value: `ending:${e.id}`, label: `Ending: ${e.title || e.id}`, icon: <Flag className="size-3.5" aria-hidden /> })),
  ];
  const linked = linkedField(rule) !== null;
  const toValue = typeof rule.to === "string" ? rule.to : `ending:${rule.to.ending}`;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2" data-testid="builder-rule-sentence">
        {linked ? null : (
          <>
            <Word>After</Word>
            <Pick ariaLabel="After" className={PILL} value={rule.from} options={steps.map(stepChoice)} onChange={(from) => onChange({ ...rule, from })} />
            <Word>,</Word>
          </>
        )}
        <Word>If</Word>
        {when}
        {targets.length ? (
          <>
            <Word>{typeof rule.to === "object" ? "finish at" : "go to"}</Word>
            <Pick
              ariaLabel="Go to"
              className={TARGET_PILL}
              value={toValue}
              options={targets}
              onChange={(v) => onChange({ ...rule, to: v.startsWith("ending:") ? { ending: v.slice("ending:".length) } : v })}
            />
          </>
        ) : null}
      </div>
      {targets.length ? null : (
        <p className="rounded-md bg-warning/15 px-3 py-2 text-xs text-amber-800 dark:text-amber-200" data-testid="builder-jump-no-target">
          Nothing comes after this question and the form has no ending, so this jump has nowhere to go. Pick an earlier
          question, or add an ending.
        </p>
      )}
    </div>
  );
}

/** The one field a jump's condition reads when that is the question it jumps after; else null. */
function linkedField(rule: Extract<LogicRule, { effect: "jump" }> | LogicRule): string | null {
  if (rule.effect !== "jump" || !("op" in rule.when)) return null;
  const left = rule.when.left;
  return "field" in left && left.field === rule.from ? left.field : null;
}

/** Whether block `id` comes after block `from`. */
function isAfter(def: FormDefinition, id: string, from: string): boolean {
  const at = def.blocks.findIndex((b) => b.id === from);
  const to = def.blocks.findIndex((b) => b.id === id);
  return at !== -1 && to > at;
}

export function RuleEditor({ def, rule, onChange }: { def: FormDefinition; rule: LogicRule; onChange: (rule: LogicRule) => void }) {
  const blocks = def.blocks;
  const steps = blocks.filter((b) => b.kind !== "page-break");
  // Where a show/hide rule turned into a jump would go: the default ending, or
  // with none (a form without endings) the next step. Null: nowhere, so it is not offered.
  const jumpFrom = rule.effect === "jump" ? rule.from : (steps.find((b) => b.kind === "field")?.id ?? steps[0]?.id ?? "");
  const defaultEnding = defaultEndingId(def);
  const nextStep = steps[steps.findIndex((b) => b.id === jumpFrom) + 1];
  const jumpTo: Extract<LogicRule, { effect: "jump" }>["to"] | null = defaultEnding ? { ending: defaultEnding } : (nextStep?.id ?? null);
  const effectOptions: Choice[] = [
    { value: "show", label: "Show a question only when…" },
    { value: "hide", label: "Hide a question when…" },
    ...(rule.effect === "jump" || jumpTo ? [{ value: "jump", label: "Jump after a question when…" }] : []),
  ];
  const goTo: Choice[] =
    rule.effect === "jump"
      ? [
          ...steps.slice(steps.findIndex((b) => b.id === rule.from) + 1).map((b) => ({ value: `block:${b.id}`, label: blockLabel(b) })),
          ...(def.endings ?? []).map((e) => ({ value: `ending:${e.id}`, label: `End: ${e.title}` })),
        ]
      : [];

  const setEffect = (effect: string) => {
    if (effect === rule.effect) return;
    if (effect === "jump") {
      if (!jumpTo) return;
      onChange({ id: rule.id, effect: "jump", when: rule.when, from: jumpFrom, to: jumpTo });
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
      {rule.effect === "jump" && !goTo.length ? (
        <p className="rounded-md bg-warning/15 px-3 py-2 text-xs text-amber-800 dark:text-amber-200" data-testid="builder-jump-no-target">
          Nothing comes after this question and the form has no ending, so this jump has nowhere to go. Pick an earlier
          question above, or add an ending.
        </p>
      ) : null}
      {rule.effect === "jump" && goTo.length ? (
        <SelectRow
          label="Go to"
          value={typeof rule.to === "string" ? `block:${rule.to}` : `ending:${rule.to.ending}`}
          options={goTo}
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
  inline = false,
  linkedJump = false,
  onRelink,
}: {
  def: FormDefinition;
  rule: LogicRule;
  condition: Condition;
  onChange: (condition: Condition) => void;
  /** Lay the clauses out as part of a sentence ("… is 2 and … is yes"), with no "When" heading. */
  inline?: boolean | undefined;
  /**
   * The first clause reads the question a jump goes after: its question pill
   * lists every question, and picking one calls `onRelink` to move the jump.
   */
  linkedJump?: boolean | undefined;
  onRelink?: ((field: FieldBlock) => void) | undefined;
}) {
  const { fieldEditors, readOnly: readOnlyConfig } = useBuilderConfig();
  const flat = flatten(condition);
  const fields = readableFields(def, rule);
  const hidden = def.hidden ?? [];
  if (!flat) {
    const json = <ConditionJson def={def} rule={rule} condition={condition} onChange={onChange} />;
    return inline ? (
      <>
        <span className="text-sm font-medium">{describeCondition(condition, def)}</span>
        <div className="basis-full">{json}</div>
      </>
    ) : (
      json
    );
  }
  const { mode, clauses } = flat;
  const setClause = (i: number, c: Comparison) => onChange(join(mode, clauses.map((x, j) => (j === i ? c : x))));
  const first = fields[0];
  const readOnly = !!readOnlyConfig;
  if (inline) {
    const relink = linkedJump && clauses.length === 1 && onRelink;
    return (
      <>
        {clauses.map((clause, i) => (
          <span key={i} className="contents" data-testid={`builder-clause-${i}`}>
            {i > 0 ? (
              <Pick
                ariaLabel="Match"
                className={cn(PILL, "bg-transparent")}
                value={mode}
                options={[
                  { value: "all", label: "and" },
                  { value: "any", label: "or" },
                ]}
                onChange={(m) => onChange(join(m as "all" | "any", clauses))}
              />
            ) : null}
            <ClauseEditor
              def={def}
              fields={relink ? fieldsOf(def) : fields}
              hidden={hidden}
              clause={clause}
              onChange={(c) => setClause(i, c)}
              onPickField={relink ? onRelink : undefined}
            />
            {readOnly || clauses.length === 1 ? null : (
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground"
                aria-label="Remove condition"
                onClick={() => onChange(join(mode, clauses.filter((_, j) => j !== i)))}
              >
                <X />
              </Button>
            )}
          </span>
        ))}
        {first && !readOnly ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-muted-foreground"
            aria-label="Add condition"
            title="Add condition"
            onClick={() => onChange(join(mode, [...clauses, starterCondition(first, fieldEditors) as Comparison]))}
          >
            <Plus />
          </Button>
        ) : null}
        {!fields.length && !hidden.length ? (
          <p className="basis-full text-xs text-muted-foreground">Logic can only read questions that come before the one it applies to.</p>
        ) : null}
      </>
    );
  }
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
          {readOnly ? null : (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Remove condition"
            disabled={clauses.length === 1}
            onClick={() => onChange(join(mode, clauses.filter((_, j) => j !== i)))}
          >
            <X />
          </Button>
          )}
        </div>
      ))}
      {first && !readOnly ? (
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
  onPickField,
}: {
  def: FormDefinition;
  fields: FieldBlock[];
  hidden: HiddenInput[];
  clause: Comparison;
  onChange: (c: Comparison) => void;
  /** Picking a question calls this instead of starting a new comparison on it. */
  onPickField?: ((field: FieldBlock) => void) | undefined;
}) {
  const leftKey = "field" in clause.left ? `field:${clause.left.field}` : "hidden" in clause.left ? `hidden:${clause.left.hidden}` : "";
  const field = "field" in clause.left ? def.blocks.find((b): b is FieldBlock => b.kind === "field" && b.id === (clause.left as { field: string }).field) : undefined;
  const input = "hidden" in clause.left ? hidden.find((h) => h.name === (clause.left as { hidden: string }).hidden) : undefined;
  const ops: Operator[] = field ? operatorsFor(field.type) : input ? HIDDEN_OPERATORS[input.type] : ["answered", "empty"];
  const config = useBuilderConfig();
  const { fieldEditors } = config;

  const leftOptions: Choice[] = [
    ...fields.map((f) => ({ value: `field:${f.id}`, label: f.label || f.key, icon: <BlockIcon block={f} config={config} className="size-3.5" /> })),
    ...hidden.map((h) => ({ value: `hidden:${h.name}`, label: `Hidden: ${h.name}` })),
  ];
  if (leftKey && !leftOptions.some((o) => o.value === leftKey)) leftOptions.unshift({ value: leftKey, label: "(not before this question)" });

  const setLeft = (v: string) => {
    if (v.startsWith("field:")) {
      const f = fields.find((x) => x.id === v.slice(6));
      if (f && onPickField) onPickField(f);
      else if (f) onChange(starterCondition(f, fieldEditors) as Comparison);
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
    onChange({ op, left: clause.left, right: { value: valueForOperator(field, op, current, fieldEditors) } });
  };

  return (
    <>
      <Pick ariaLabel="Question" className={PILL} value={leftKey} options={leftOptions} onChange={setLeft} />
      <Pick
        ariaLabel="Comparison"
        className={PILL}
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
  if (field && Custom) return <Custom field={field} op={op} value={value} onChange={onChange} readOnly={!!config.readOnly} />;
  const boolean = field?.type === "yes-no" || input?.type === "boolean";
  if (boolean) {
    return (
      <Pick
        ariaLabel="Value"
        className={PILL}
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
        className={PILL}
        value={typeof value === "string" ? value : ""}
        options={options.map((o) => ({ value: o.value, label: o.label ?? o.value }))}
        onChange={onChange}
      />
    );
  }
  const numeric = field
    ? field.type === "rating" ||
      field.type === "nps" ||
      field.type === "number" ||
      (field.type === "calculated" && field.props?.format !== "text")
    : input?.type === "number";
  if (field?.type === "date" && op !== "in") {
    return (
      <Input
        aria-label="Value"
        type="date"
        className="h-8 w-44"
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
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
        className="h-8 w-24"
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
      className="h-8 w-44"
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
      className="h-8 w-44"
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
