import { useMemo, useState } from "react";
import { Badge } from "@marktiderman/genesis-ui/badge";
import { Label } from "@marktiderman/genesis-ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@marktiderman/genesis-ui/select";
import { explain, steps, type FieldValidation, type FormEngine } from "@marktiderman/genesis-forms";
import { useFormSelector } from "@marktiderman/genesis-forms-react";

const VALIDATION: Record<FieldValidation["status"], string> = {
  valid: "Valid.",
  invalid: "Invalid",
  unanswered: "Unanswered, and that is allowed.",
  "not-checked": "Not checked: a field off screen is neither validated nor stored.",
};

/**
 * "Why is this hidden?" Pick a block (by default, the one on screen) and read
 * `explain()` in plain English: visibility, the jump that skipped it, each
 * show/hide rule with its result, and validation.
 */
export function LogicTracePanel({ engine, blockId }: { engine: FormEngine; blockId?: string | undefined }) {
  const state = useFormSelector(engine, (s) => s);
  const blocks = useMemo(() => steps(engine.definition), [engine.definition]);
  const [picked, setPicked] = useState<string | null>(blockId ?? null);
  const fallback = state.current ?? state.path[0] ?? blocks[0]?.id;
  const id = picked && blocks.some((b) => b.id === picked) ? picked : fallback;
  const trace = useMemo(() => (id ? explain(engine, id) : null), [engine, id, state]);
  const nameOf = (bid: string) => {
    const b = engine.block(bid);
    return b?.kind === "field" ? b.key : bid;
  };

  if (!id || !trace) return <p className="text-sm text-muted-foreground">This form has no blocks.</p>;
  return (
    <div className="space-y-3" data-testid="devtools-trace">
      <div className="space-y-1">
        <Label htmlFor="gf-trace-block">Block</Label>
        <Select value={id} onValueChange={setPicked}>
          <SelectTrigger id="gf-trace-block" aria-label="Block to explain">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {blocks.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {nameOf(b.id)}
                {b.id === state.current ? " (on screen)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap gap-1">
        <Badge variant={trace.visible ? "success" : "muted"}>{trace.visible ? "visible" : "not shown"}</Badge>
        <Badge variant="outline">{trace.onPath ? "on the path" : "off the path"}</Badge>
        <Badge variant="outline">{trace.ruleVisible ? "rules allow it" : "rules hide it"}</Badge>
      </div>
      <p className="text-sm font-medium" data-testid="devtools-trace-summary">
        {trace.summary}
      </p>

      {trace.skippedBy ? (
        <div className="space-y-1 rounded-md border p-3">
          <p className="text-sm font-medium">Jump</p>
          {trace.skippedBy.sentence !== trace.summary ? <p className="text-sm">{trace.skippedBy.sentence}</p> : null}
          <p className="text-sm text-muted-foreground">
            Rule {trace.skippedBy.ruleId}, from {nameOf(trace.skippedBy.from)} to{" "}
            {typeof trace.skippedBy.to === "string" ? nameOf(trace.skippedBy.to) : `the "${trace.skippedBy.to.ending}" ending`}.
          </p>
        </div>
      ) : null}

      <div className="space-y-1">
        <p className="text-sm font-medium">Show/hide rules</p>
        {trace.rules.length ? (
          <ul className="space-y-1">
            {trace.rules.map((r) => (
              <li key={r.ruleId} className="flex items-start gap-2 rounded-md border p-2 text-sm">
                <Badge variant={r.matched ? "warning" : "muted"} className="shrink-0">
                  {r.matched ? "holds" : "does not hold"}
                </Badge>
                <span className="min-w-0">
                  {r.sentence}
                  <span className="block text-xs text-muted-foreground">
                    {r.effect} rule {r.ruleId}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No rule shows or hides {trace.key}.</p>
        )}
      </div>

      {trace.validation ? (
        <div className="space-y-1">
          <p className="text-sm font-medium">Validation</p>
          <p className="text-sm">
            {trace.validation.status === "invalid"
              ? `${VALIDATION.invalid}: ${trace.validation.message}`
              : VALIDATION[trace.validation.status]}
          </p>
        </div>
      ) : null}
    </div>
  );
}
