import { useEffect, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { fingerprint, parseForm, type FormDefinition } from "@marktiderman/genesis-forms";
import { Form, type FormBrand } from "@marktiderman/genesis-forms-web";
import { Button } from "@marktiderman/genesis-ui/button";
import { ToggleGroup, ToggleGroupItem } from "@marktiderman/genesis-ui/toggle-group";

/**
 * The real `<Form>`, restarted whenever the definition changes, in a
 * phone-sized frame. Submitting only shows the ending; nothing is sent.
 */
export function Preview({
  def,
  brand,
  hidden,
}: {
  def: FormDefinition;
  brand?: FormBrand;
  /** Sample values for hidden inputs, so recall and logic on them can be tried. */
  hidden?: Record<string, string | number | boolean>;
}) {
  const mode = def.layout?.mode ?? "focus";
  const [layout, setLayout] = useState<"focus" | "classic">(mode);
  // Follow the form's own layout setting; the toggle overrides it until it changes again.
  useEffect(() => setLayout(mode), [mode]);
  const [run, setRun] = useState(0);
  const parsed = useMemo(() => parseForm(def), [def]);
  const key = useMemo(() => `${fingerprint(def)}:${layout}:${run}`, [def, layout, run]);

  return (
    <div className="space-y-2" data-testid="builder-preview">
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
          {parsed.ok ? (
            <Form
              key={key}
              form={parsed.form}
              layout={layout}
              brand={brand}
              options={hidden ? { hidden } : undefined}
              onSubmit={() => undefined}
            />
          ) : (
            <div className="space-y-2 p-4 text-sm">
              <p className="font-medium">The preview starts once the form is valid.</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                {parsed.issues.slice(0, 5).map((i, n) => (
                  <li key={n}>{i.message}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
