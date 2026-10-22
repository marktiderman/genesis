import { useMemo, useState } from "react";
import { Badge } from "@marktiderman/genesis-ui/badge";
import { Button } from "@marktiderman/genesis-ui/button";
import { describeCondition, type FormDefinition, type FormEvent, type Json } from "@marktiderman/genesis-forms";
import { coverage, type EndingCoverage } from "@marktiderman/genesis-forms/testing";

/** The events that replay a coverage witness: its answers in path order, then submit. */
export function witnessEvents(definition: FormDefinition, witness: Record<string, Json>): FormEvent[] {
  const idOf = new Map(definition.blocks.flatMap((b) => (b.kind === "field" ? [[b.key, b.id] as const] : [])));
  return [
    ...Object.entries(witness).map(([key, value]): FormEvent => ({ type: "answer", field: idOf.get(key) ?? key, value })),
    { type: "submit" },
  ];
}

export interface CoveragePanelProps {
  definition: FormDefinition;
  /**
   * Restart the playground from a witness (the same hook as the timeline's
   * "Continue from here"). `hidden` is set when the witness needs hidden inputs.
   */
  onFork?: ((events: FormEvent[], hidden?: Record<string, Json>) => void) | undefined;
  /** Run automatically for forms with at most this many fields; larger ones wait for "Run". Default 12. */
  autoRunFields?: number | undefined;
  maxStates?: number | undefined;
}

/**
 * Symbolic path coverage of the definition: unreachable blocks, rules that
 * never fire, and for each ending whether a response can reach it, with a
 * witness to load into the playground.
 */
export function CoveragePanel({ definition, onFork, autoRunFields = 12, maxStates }: CoveragePanelProps) {
  const fieldCount = definition.blocks.filter((b) => b.kind === "field").length;
  const [ranFor, setRanFor] = useState<FormDefinition | null>(null);
  const enabled = fieldCount <= autoRunFields || ranFor === definition;
  const report = useMemo(
    () => (enabled ? coverage(definition, maxStates === undefined ? {} : { maxStates }) : null),
    [definition, enabled, maxStates],
  );
  const rules = new Map((definition.logic ?? []).map((r) => [r.id, r]));
  const titleOf = (id: string) => definition.endings?.find((e) => e.id === id)?.title ?? id;

  if (!report) {
    return (
      <div className="space-y-2" data-testid="devtools-coverage">
        <p className="text-sm text-muted-foreground">
          This form has {fieldCount} fields, so coverage runs when you ask. It explores every combination of answers a
          respondent could give, and can take a moment.
        </p>
        <Button size="sm" onClick={() => setRanFor(definition)}>
          Run coverage
        </Button>
      </div>
    );
  }

  const endings = Object.entries(report.endings) as [string, EndingCoverage][];
  return (
    <div className="space-y-4" data-testid="devtools-coverage">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">
          Explored {report.pathsExplored} completed {report.pathsExplored === 1 ? "response" : "responses"}.
        </p>
        {report.truncated ? (
          <Badge variant="warning">Truncated: stopped early, so results are partial</Badge>
        ) : (
          <Badge variant="success">Complete</Badge>
        )}
      </div>

      <section className="space-y-1">
        <h3 className="text-sm font-medium">Endings</h3>
        {endings.length ? (
          <ul className="space-y-2">
            {endings.map(([id, e]) => (
              <li key={id} className="space-y-1 rounded-md border p-2 text-sm" data-testid={`coverage-ending-${id}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{titleOf(id)}</span>
                  <Badge variant={e.reached ? "success" : "destructive"}>{e.reached ? "reached" : "not reached"}</Badge>
                  {e.reached && e.witness && onFork ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto"
                      onClick={() => onFork(witnessEvents(definition, e.witness!), e.witnessHidden)}
                    >
                      Load witness
                    </Button>
                  ) : null}
                </div>
                {e.witness ? (
                  <p className="font-mono text-xs text-muted-foreground">
                    {Object.entries(e.witness)
                      .map(([k, v]) => `${k} = ${JSON.stringify(v)}`)
                      .join(", ") || "no answers"}
                    {e.witnessHidden ? `; hidden ${JSON.stringify(e.witnessHidden)}` : ""}
                  </p>
                ) : null}
                {e.needsSamples ? (
                  <p className="text-xs text-muted-foreground">
                    Coverage could not verify reachability without sample answers for {e.needsSamples.join(", ")}.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">The form defines no endings.</p>
        )}
      </section>

      <section className="space-y-1">
        <h3 className="text-sm font-medium">Unreachable blocks</h3>
        {report.unreachableBlocks.length ? (
          <ul className="flex flex-wrap gap-1">
            {report.unreachableBlocks.map((k) => (
              <li key={k}>
                <Badge variant="destructive">{k}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Every block is reachable.</p>
        )}
      </section>

      <section className="space-y-1">
        <h3 className="text-sm font-medium">Rules that never fire</h3>
        {report.rulesNeverFired.length ? (
          <ul className="space-y-1">
            {report.rulesNeverFired.map((id) => {
              const rule = rules.get(id);
              return (
                <li key={id} className="rounded-md border p-2 text-sm">
                  <span className="font-mono text-xs">{id}</span>
                  {rule ? (
                    <span className="block text-muted-foreground">
                      {rule.effect} when {describeCondition(rule.when, definition)}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Every rule fires in some response.</p>
        )}
      </section>
    </div>
  );
}
