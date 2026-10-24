/**
 * The builder's editor for `calculated` fields: the formula, checked as it is
 * typed with the same checks `parseForm` runs, the answers it can use, the
 * format, and a value worked out from sample answers.
 */
import { useId, useMemo, useState } from "react";
import { Calculator } from "lucide-react";
import {
  calculatedProps,
  calculatedValue,
  evaluateFormula,
  formatCalculated,
  formulaRefs,
  parseForm,
  parseFormula,
  tableColumns,
  type FieldBlock,
  type FormDefinition,
  type FormulaRef,
  type FormulaValue,
} from "@marktiderman/genesis-forms";
import { Button } from "@marktiderman/genesis-ui/button";
import { Input } from "@marktiderman/genesis-ui/input";
import { Label } from "@marktiderman/genesis-ui/label";
import { NumberRow, SelectRow, TextRow } from "./controls";
import type { FieldPanelProps, FieldTypeEditor } from "./editors";

const refName = (r: FormulaRef) => (r.column === undefined ? r.key : `${r.key}.${r.column}`);

/** The answers a formula in `field` may name: every other question (a table by its columns), and calculated ones before it. */
export function formulaNames(def: FormDefinition, field: FieldBlock): string[] {
  const at = def.blocks.findIndex((b) => b.id === field.id);
  return def.blocks.flatMap((b, i) => {
    if (b.kind !== "field" || b.id === field.id) return [];
    if (b.type === "calculated" && i > at) return [];
    if (b.type === "table") return tableColumns(b).map((c) => `${b.key}.${c.key}`);
    if (b.type === "media-notes" || b.type === "text-highlights" || b.type === "photo") return [];
    return [b.key];
  });
}

/** The problems `parseForm` finds in this field's formula. */
function formulaProblems(def: FormDefinition, field: FieldBlock): string[] {
  const at = def.blocks.findIndex((b) => b.id === field.id);
  const parsed = parseForm(def);
  return parsed.ok ? [] : parsed.issues.filter((i) => i.path === `blocks[${at}].props.formula`).map((i) => i.message);
}

/** A sample typed for an answer: a list for list-like answers ("1, 2, 3"), else the text. */
function sampleValue(def: FormDefinition, ref: FormulaRef, raw: string | undefined): FormulaValue {
  if (raw === undefined || raw.trim() === "") return null;
  const target = def.blocks.find((b): b is FieldBlock => b.kind === "field" && b.key === ref.key);
  const listy = ref.column !== undefined || target?.type === "list" || target?.type === "multi-choice";
  return listy ? raw.split(",").map((s) => s.trim()).filter(Boolean) : raw;
}

function CalculatedPanel({ def, field, setProps, readOnly }: FieldPanelProps) {
  const { formula, format, decimals } = calculatedProps(field);
  const problems = useMemo(() => formulaProblems(def, field), [def, field]);
  const names = useMemo(() => formulaNames(def, field), [def, field]);
  const [samples, setSamples] = useState<Record<string, string>>({});
  const sampleId = useId();
  const refs = formulaRefs(formula);
  const parsed = parseFormula(formula);
  const result =
    parsed.ok && !problems.length
      ? formatCalculated(calculatedValue(evaluateFormula(parsed.ast, (r) => sampleValue(def, r, samples[refName(r)])), field), field)
      : "";
  const insert = (name: string) => setProps({ formula: formula.trim() ? `${formula.trimEnd()} ${name}` : name });
  return (
    <div className="space-y-4" data-testid="builder-calculated">
      <div className="space-y-1.5">
        <TextRow
          label="Formula"
          value={formula}
          testID="builder-calculated-formula"
          placeholder="hours * rate"
          hint="Use answer names, numbers, + − × ÷, brackets, comparisons, “test ? a : b”, and sum, avg, min or max of a list or a table column (plan.cost). Respondents see the value and can't change it."
          onChange={(next) => setProps({ formula: next }, `formula:${field.id}`)}
        />
        <p aria-live="polite" className="text-xs" data-testid="builder-calculated-check">
          {problems.length ? <span className="text-destructive">{problems[0]}</span> : <span className="text-muted-foreground">The formula works.</span>}
        </p>
      </div>
      {names.length && !readOnly ? (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Answers you can use</p>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Add an answer to the formula">
            {names.map((name) => (
              <Button key={name} type="button" size="sm" variant="outline" className="h-7 font-mono text-xs" onClick={() => insert(name)}>
                {name}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectRow
          label="Show as"
          value={format ?? "auto"}
          testID="builder-calculated-format"
          options={[
            { value: "auto", label: "As worked out" },
            { value: "number", label: "Number" },
            { value: "percent", label: "Percent (0.25 shows 25%)" },
            { value: "text", label: "Text" },
          ]}
          onChange={(v) => setProps({ format: v === "auto" ? undefined : v })}
        />
        <NumberRow
          label="Decimal places"
          commitOnBlur
          min={0}
          max={10}
          value={decimals}
          testID="builder-calculated-decimals"
          hint="Leave empty to keep them all."
          onChange={(n) => setProps({ decimals: n === undefined ? undefined : Math.min(10, Math.max(0, n)) })}
        />
      </div>
      {refs.length ? (
        <fieldset className="space-y-2 rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">Try it</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {refs.map((r, i) => {
              const name = refName(r);
              return (
                <div key={name} className="space-y-1">
                  <Label htmlFor={`${sampleId}-${i}`} className="font-mono text-xs">
                    {name}
                  </Label>
                  <Input
                    id={`${sampleId}-${i}`}
                    className="h-8"
                    placeholder={r.column !== undefined ? "1, 2, 3" : "Sample answer"}
                    value={samples[name] ?? ""}
                    data-testid={`builder-calculated-sample-${name}`}
                    onChange={(e) => setSamples((s) => ({ ...s, [name]: e.target.value }))}
                  />
                </div>
              );
            })}
          </div>
          <p className="text-sm" aria-live="polite">
            Shows: <output data-testid="builder-calculated-preview" className="font-medium tabular-nums">{result || "—"}</output>
          </p>
        </fieldset>
      ) : (
        <p className="text-sm">
          Shows: <output data-testid="builder-calculated-preview" className="font-medium tabular-nums">{result || "—"}</output>
        </p>
      )}
    </div>
  );
}

export const CALCULATED_FIELD_EDITOR: FieldTypeEditor = {
  type: "calculated",
  icon: <Calculator className="size-4 text-muted-foreground" aria-hidden="true" />,
  Panel: CalculatedPanel,
};
