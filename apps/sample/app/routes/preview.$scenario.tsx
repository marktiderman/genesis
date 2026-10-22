import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import type { FormEngine, Json } from "@marktiderman/genesis-forms";
import { validateSubmission } from "@marktiderman/genesis-forms/server";
import { Form } from "@marktiderman/genesis-forms-web";
import { demoBrand, scenarios } from "../lib/forms";
import { useSystemTheme } from "../lib/use-system-theme";

export function meta() {
  return [{ title: "Respondent preview" }];
}

/**
 * What a member sees after scanning the QR code: the form alone, full screen,
 * with the organisation's brand and none of the app's chrome. Submitting runs the
 * server check locally and shows the ending; nothing is stored.
 * `?layout=classic` or `?layout=focus` overrides the form's own layout.
 */
export default function RespondentPreview() {
  const { scenario: id } = useParams();
  const [params] = useSearchParams();
  const scenario = scenarios.find((s) => s.id === id);
  const [run, setRun] = useState(0);
  useSystemTheme();

  if (!scenario) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-4 text-center text-foreground">
        <h1 className="text-2xl font-semibold">There's no form here.</h1>
        <Link to="/forms" className="text-primary underline underline-offset-4">
          Back to the playground
        </Link>
      </main>
    );
  }

  const layoutParam = params.get("layout");
  const layout = layoutParam === "classic" || layoutParam === "focus" ? layoutParam : undefined;
  const definition = scenario.form.definition;

  const onSubmit = (engine: FormEngine) => {
    const state = engine.getState();
    const answers: Record<string, Json> = {};
    for (const [key, value] of Object.entries(state.values)) if (value !== undefined) answers[key] = value;
    const result = validateSubmission(
      definition,
      { answers, events: state.events },
      { context: scenario.context },
    );
    if (!result.ok) {
      console.warn("The server check rejected this response", result.errors);
      throw new Error("Rejected by the server check.");
    }
  };

  return (
    <>
      <Form
        key={run}
        form={scenario.form}
        options={{ hidden: scenario.context }}
        presentation="page"
        layout={layout}
        brand={demoBrand}
        onSubmit={onSubmit}
      />
      {/* The only chrome: a quiet way out, top-right, for whoever is previewing. */}
      <nav aria-label="Preview" className="fixed right-2 top-2.5 z-20 flex items-center gap-1 sm:right-4 sm:top-4.5">
        <button
          type="button"
          onClick={() => setRun((n) => n + 1)}
          className="hidden h-11 items-center rounded-md px-3 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex"
        >
          Restart
        </button>
        <Link
          to={`/forms/${scenario.id}`}
          className="inline-flex h-11 items-center rounded-md px-3 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Exit preview
        </Link>
      </nav>
    </>
  );
}
