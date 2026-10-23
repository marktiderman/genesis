import { memo, useId, useMemo, useState } from "react";
import { ArrowDown, ArrowRight, CircleCheck, EyeOff, Flag, TriangleAlert } from "lucide-react";
import {
  choiceOptions,
  computePath,
  describeCondition,
  type Condition,
  type FieldBlock,
  type FormDefinition,
  type Json,
  type LogicRule,
} from "@marktiderman/genesis-forms";
import { Button } from "@marktiderman/genesis-ui/button";
import { cn } from "@marktiderman/genesis-ui/utils";
import { PATH_FINDINGS, type Finding } from "./analyze";
import { useBuilderConfig } from "./editors";
import { OPERATOR_LABEL } from "./logic";
import { defaultEndingId } from "./ops";
import { BlockIcon } from "./type-icons";

type Jump = Extract<LogicRule, { effect: "jump" }>;
type Comparison = Extract<Condition, { op: string }>;

/** What the flow map's check chip says, from the builder's path checks. */
export type FlowCheck = "ok" | "issues" | "not-checked" | "invalid";

/** Sum up the path checks: every path ends, some do not, too many to check, or the form must be fixed first. */
export function flowCheck(findings: readonly Finding[]): { state: FlowCheck; count: number } {
  if (findings.some((f) => f.level === "error" && f.path !== undefined)) return { state: "invalid", count: 0 };
  if (findings.some((f) => f.code === "paths-not-checked")) return { state: "not-checked", count: 0 };
  const count = findings.filter((f) => f.code && PATH_FINDINGS.has(f.code)).length;
  return { state: count ? "issues" : "ok", count };
}

function valueText(value: Json | undefined, field: FieldBlock | undefined): string {
  if (Array.isArray(value)) return value.map((v) => valueText(v, field)).join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (field && typeof value === "string") {
    const option = choiceOptions(field).find((o) => o.value === value);
    if (option) return option.label ?? option.value;
  }
  return value === undefined || value === null ? "" : String(value);
}

/** A jump's condition in a few words: "is at most 2" when it reads the question it jumps after, else in full. */
function shortCondition(rule: Jump, def: FormDefinition, fields: Map<string, FieldBlock>): string {
  const c = rule.when;
  if ("op" in c && "field" in c.left && c.left.field === rule.from) {
    const op = OPERATOR_LABEL[c.op] ?? c.op;
    if (!c.right) return op;
    return "value" in c.right ? `${op} ${valueText(c.right.value, fields.get(rule.from))}` : describeCondition(c, def);
  }
  return describeCondition(c, def);
}

/** An answer that makes a single comparison true, to try the path it opens; undefined when there is no simple one. */
function answerFor(c: Comparison): Json | undefined {
  if (!c.right || !("value" in c.right)) return undefined;
  const v = c.right.value;
  switch (c.op) {
    case "eq":
    case "lte":
    case "gte":
    case "contains":
      return c.op === "contains" ? [v] : v;
    case "lt":
      return typeof v === "number" ? v - 1 : undefined;
    case "gt":
      return typeof v === "number" ? v + 1 : undefined;
    case "in":
      return Array.isArray(v) ? v[0] : undefined;
    default:
      return undefined;
  }
}

interface Trial {
  label: string;
  values: Record<string, Json>;
}

/** "Rate 2", "Answer Yes": a quick answer per jump with a simple condition, at most four. */
function trials(def: FormDefinition, jumps: Jump[], fields: Map<string, FieldBlock>): Trial[] {
  const out: Trial[] = [];
  for (const rule of jumps) {
    const c = rule.when;
    if (!("op" in c) || !("field" in c.left)) continue;
    const field = fields.get(c.left.field);
    const value = answerFor(c);
    if (!field || value === undefined) continue;
    // `contains` gets a list; label it by the one item.
    const shown = valueText(Array.isArray(value) && value.length === 1 ? value[0] : value, field);
    const label =
      field.type === "rating" || field.type === "nps" ? `Rate ${shown}` : `${field.label.length > 18 ? `${field.label.slice(0, 17)}…` : field.label || field.key}: ${shown}`;
    if (out.some((t) => t.label === label)) continue;
    out.push({ label, values: { [field.id]: value } });
    if (out.length === 4) break;
  }
  return out;
}

/**
 * The form's flow: its steps in order with arrows between them, the jumps
 * branching off each step, and the endings. The chip sums up the path checks;
 * "Try a path" lights up where one answer leads.
 */
export const FlowMap = memo(function FlowMap({ def, findings }: { def: FormDefinition; findings: readonly Finding[] }) {
  const config = useBuilderConfig();
  const id = useId();
  const steps = def.blocks.filter((b) => b.kind !== "page-break");
  const fields = useMemo(() => new Map(def.blocks.filter((b): b is FieldBlock => b.kind === "field").map((f) => [f.id, f])), [def.blocks]);
  const jumps = (def.logic ?? []).filter((r): r is Jump => r.effect === "jump");
  const conditional = new Set((def.logic ?? []).flatMap((r) => (r.effect === "jump" ? [] : [r.target])));
  const unreachable = new Set(findings.flatMap((f) => (f.code === "unreachable-block" || f.code === "unreachable-ending") && f.ref ? [f.ref.id] : []));
  const numbers = new Map<string, number>();
  for (const b of def.blocks) if (b.kind === "field") numbers.set(b.id, numbers.size + 1);
  const endings = def.endings ?? [];
  const defaultEnding = defaultEndingId(def);
  const label = (to: Jump["to"]) =>
    typeof to === "object"
      ? (endings.find((e) => e.id === to.ending)?.title ?? to.ending)
      : (() => {
          const b = def.blocks.find((x) => x.id === to);
          return b?.kind === "field" ? b.label || b.key : b?.kind === "content" ? b.text.slice(0, 40) : to;
        })();

  // The builder's checks already parsed this definition: no second parse per edit.
  const { state, count } = flowCheck(findings);
  const valid = state !== "invalid";
  const options = useMemo(() => (valid ? trials(def, jumps, fields) : []), [valid, def.logic, fields]);
  const [trying, setTrying] = useState<string | null>(null);
  const trial = options.find((t) => t.label === trying);
  const path = useMemo(() => {
    if (!trial) return null;
    const result = computePath(def, { values: trial.values, hidden: {}, fields });
    return { blocks: new Set(result.path), ending: result.ending };
  }, [def, trial, fields]);

  const chip =
    state === "ok"
      ? { text: "Every path ends", Icon: CircleCheck, className: "bg-success/15 text-emerald-700 dark:bg-success/20 dark:text-emerald-300" }
      : state === "issues"
        ? { text: `${count} path ${count === 1 ? "problem" : "problems"}`, Icon: TriangleAlert, className: "bg-warning/15 text-amber-800 dark:bg-warning/20 dark:text-amber-200" }
        : state === "not-checked"
          ? { text: "Too many paths to check", Icon: TriangleAlert, className: "bg-muted text-muted-foreground" }
          : { text: "Fix the errors to check paths", Icon: TriangleAlert, className: "bg-muted text-muted-foreground" };

  const nodeClass = (blockId: string, ending = false) =>
    cn(
      "flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-opacity",
      ending ? "border-primary/30 bg-primary/10 font-medium text-primary" : "bg-background",
      unreachable.has(blockId) && "border-dashed border-warning text-muted-foreground",
      path && (path.blocks.has(blockId) || path.ending === blockId ? "ring-2 ring-primary" : "opacity-40"),
    );

  const later = endings.filter((e) => e.id !== defaultEnding);
  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm" aria-labelledby={`${id}-flow`} data-testid="builder-flow">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h3 id={`${id}-flow`} className="flex-1 text-base font-semibold">
          Flow
        </h3>
        <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium", chip.className)} data-testid="builder-flow-check" data-state={state}>
          <chip.Icon className="size-3.5" aria-hidden />
          {chip.text}
        </span>
      </div>
      {steps.length ? (
        <ol className="space-y-1" aria-label="Steps in order">
          {steps.map((b, i) => {
            const out = jumps.filter((r) => r.from === b.id);
            const name = b.kind === "field" ? `${numbers.get(b.id)} · ${b.label || b.key}` : b.kind === "content" ? b.text.slice(0, 60) || b.type : "";
            return (
              <li key={b.id} data-testid={`builder-flow-step-${b.id}`}>
                <div className={nodeClass(b.id)}>
                  <span className="shrink-0 text-muted-foreground">
                    <BlockIcon block={b} config={config} className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate" title={name}>
                    {name}
                  </span>
                  {conditional.has(b.id) ? <EyeOff className="size-3.5 shrink-0 text-amber-700 dark:text-amber-300" aria-label="Shown only by a rule" /> : null}
                  {unreachable.has(b.id) ? <span className="shrink-0 text-xs text-amber-800 dark:text-amber-200">Never reached</span> : null}
                </div>
                {out.map((r) => (
                  <p
                    key={r.id}
                    className="ml-3 flex items-start gap-1.5 py-1 text-xs text-violet-700 dark:text-violet-300"
                    data-testid={`builder-flow-branch-${r.id}`}
                  >
                    <ArrowRight className="mt-0.5 size-3 shrink-0" aria-hidden />
                    <span className="min-w-0">
                      {shortCondition(r, def, fields)}: {typeof r.to === "object" ? "finish at" : "skip to"} “{label(r.to)}”
                    </span>
                  </p>
                ))}
                {i < steps.length - 1 || defaultEnding ? (
                  <ArrowDown className="ml-3 my-0.5 size-3.5 text-muted-foreground" aria-hidden />
                ) : null}
              </li>
            );
          })}
          {defaultEnding ? (
            <li data-testid={`builder-flow-ending-${defaultEnding}`}>
              <div className={nodeClass(defaultEnding, true)}>
                <Flag className="size-3.5 shrink-0" aria-hidden />
                <span className="min-w-0 truncate">{endings.find((e) => e.id === defaultEnding)?.title || "Default ending"}</span>
              </div>
            </li>
          ) : null}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">Add a question to see the flow.</p>
      )}
      {later.length ? (
        <div className="mt-4 space-y-1.5">
          <p className="text-xs text-muted-foreground">Reached only by a jump</p>
          <ul className="space-y-1.5">
            {later.map((e) => (
              <li key={e.id} data-testid={`builder-flow-ending-${e.id}`}>
                <div className={nodeClass(e.id, true)}>
                  <Flag className="size-3.5 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{e.title || e.id}</span>
                  {unreachable.has(e.id) ? <span className="shrink-0 text-xs font-normal text-amber-800 dark:text-amber-200">Never reached</span> : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {options.length ? (
        <div className="mt-4 flex flex-wrap items-center gap-1 rounded-lg bg-muted px-3 py-2" role="group" aria-label="Try a path">
          <span className="mr-1 text-sm font-medium">Try a path:</span>
          {options.map((t) => (
            <Button
              key={t.label}
              type="button"
              size="sm"
              variant={trying === t.label ? "secondary" : "ghost"}
              className="h-7 px-2 text-sm font-normal"
              aria-pressed={trying === t.label}
              onClick={() => setTrying(trying === t.label ? null : t.label)}
            >
              {t.label}
            </Button>
          ))}
        </div>
      ) : null}
      {path ? (
        <p className="mt-2 text-xs text-muted-foreground" aria-live="polite" data-testid="builder-flow-path">
          {trying}: {path.blocks.size} step{path.blocks.size === 1 ? "" : "s"}, then “{endings.find((e) => e.id === path.ending)?.title ?? "the end"}”.
        </p>
      ) : null}
    </section>
  );
});
