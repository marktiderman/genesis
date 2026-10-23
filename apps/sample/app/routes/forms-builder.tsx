import { useState } from "react";
import { Button } from "@marktiderman/genesis-ui/button";
import { Badge } from "@marktiderman/genesis-ui/badge";
import { Label } from "@marktiderman/genesis-ui/label";
import { Switch } from "@marktiderman/genesis-ui/switch";
import { FormBuilder, defaultPalette, diffDefinitions, getTemplate } from "@marktiderman/genesis-forms-builder";
import { COMPUTED_FIELD_TYPES, STRUCTURED_FIELD_TYPES, type FormDefinition } from "@marktiderman/genesis-forms";
import { SAMPLE_TEMPLATES } from "../lib/form-templates";

/** The starter templates use the structured types, so authors can add them too, and calculated fields. */
const palette = [...defaultPalette(), ...STRUCTURED_FIELD_TYPES, ...COMPUTED_FIELD_TYPES];

/** The form builder on its own. Nothing is stored: "Publish" only shows what would change. */
export default function FormsBuilderRoute() {
  const [template, setTemplate] = useState("event-feedback");
  const [start, setStart] = useState<FormDefinition>(() => getTemplate("event-feedback", SAMPLE_TEMPLATES)!.create());
  const [published, setPublished] = useState<FormDefinition>(start);
  const [note, setNote] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);

  const load = (id: string) => {
    const def = getTemplate(id, SAMPLE_TEMPLATES)!.create();
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
          {SAMPLE_TEMPLATES.map((t) => (
            <Button key={t.id} testID={`template-${t.id}`} size="sm" variant={t.id === template ? "default" : "outline"} onClick={() => load(t.id)}>
              {t.name}
            </Button>
          ))}
          <Label className="ml-auto flex items-center gap-2 text-sm font-normal">
            <Switch checked={readOnly} onCheckedChange={setReadOnly} data-testid="builder-sample-readonly" />
            Read only (a viewer without edit access)
          </Label>
        </div>
      </div>
      <FormBuilder
        key={start.id}
        defaultValue={start}
        palette={palette}
        readOnly={readOnly}
        actions={(_def, _analysis, builder) => readOnly ? null : (
          <Button
            testID="builder-publish"
            size="sm"
            // Always pressable: a click on a form that isn't ready shows every check that blocks it,
            // including the title of a question still being written.
            onClick={() => {
              // Commit a key still being typed, then gate on the checks of exactly that value.
              const def = builder.flush();
              if (!builder.getAnalysis().canPublish) {
                builder.revealChecks();
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
