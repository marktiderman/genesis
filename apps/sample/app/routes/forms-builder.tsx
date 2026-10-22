import { useState } from "react";
import { Button } from "@marktiderman/genesis-ui/button";
import { Badge } from "@marktiderman/genesis-ui/badge";
import { FormBuilder, TEMPLATES, diffDefinitions, getTemplate } from "@marktiderman/genesis-forms-builder";
import type { FormDefinition } from "@marktiderman/genesis-forms";

/** The form builder on its own. Nothing is stored: "Publish" only shows what would change. */
export default function FormsBuilderRoute() {
  const [template, setTemplate] = useState("after-class");
  const [start, setStart] = useState<FormDefinition>(() => getTemplate("after-class")!.create());
  const [published, setPublished] = useState<FormDefinition>(start);
  const [note, setNote] = useState<string | null>(null);

  const load = (id: string) => {
    const def = getTemplate(id)!.create();
    setTemplate(id);
    setStart(def);
    setPublished(def);
    setNote(null);
  };

  return (
    <div className="space-y-4 p-6">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Form builder</h1>
        <p className="text-sm text-muted-foreground">
          Start from a template, edit questions and logic, and watch the preview. Nothing is stored.
        </p>
        <div className="flex flex-wrap gap-2">
          {TEMPLATES.map((t) => (
            <Button key={t.id} testID={`template-${t.id}`} size="sm" variant={t.id === template ? "default" : "outline"} onClick={() => load(t.id)}>
              {t.name}
            </Button>
          ))}
        </div>
      </div>
      <FormBuilder
        key={start.id}
        defaultValue={start}
        actions={(_def, analysis, builder) => (
          <Button
            testID="builder-publish"
            size="sm"
            // The analysis shown can be a keystroke behind; the click checks the current value.
            disabled={!analysis.canPublish && !builder.analysing}
            onClick={() => {
              // Commit a key still being typed, then gate on the checks of exactly that value.
              const def = builder.flush();
              if (!builder.getAnalysis().canPublish) {
                setNote("Fix the problems listed before publishing.");
                return;
              }
              const changes = diffDefinitions(published, def);
              const breaking = changes.filter((c) => c.breaking).length;
              setNote(changes.length ? `${changes.length} change(s), ${breaking} breaking.` : "No changes.");
              setPublished(def);
            }}
          >
            Publish
          </Button>
        )}
      />
      {note ? <Badge variant="outline">{note}</Badge> : null}
    </div>
  );
}
