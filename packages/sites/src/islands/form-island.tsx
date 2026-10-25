/**
 * The form island: makes a server-rendered genesis-forms `<Form>` live.
 * Loaded by the islands loader only on pages with a form. It reads the
 * definition from the JSON beside the form and renders it in place of the
 * server's markup (the same form and header slot, so nothing moves). It
 * renders rather than hydrates: the form's ids come from React's useId,
 * which differ between a whole-page server render and a client root. It POSTs `{ form, answers }` as JSON
 * to the island's `data-gs-submit` URL. A failed send rejects, so the form
 * shows its error and a "Try again" button.
 */
import { createRoot } from "react-dom/client";
import { Form } from "@marktiderman/genesis-forms-web";
import type { FormDefinition } from "@marktiderman/genesis-forms";
import { siteFormSlots } from "../sections/form-header";

document.querySelectorAll<HTMLElement>('[data-gs-island="form"]').forEach((island) => {
  const root = island.querySelector<HTMLElement>("[data-gs-form-root]");
  const json = island.querySelector('script[data-gs-form-definition]')?.textContent;
  const submit = island.dataset.gsSubmit;
  const slug = island.dataset.gsForm;
  if (!root || !json || !submit || !slug) {
    console.error("[genesis-sites] a form island is missing its definition, root or submit URL.");
    return;
  }
  let definition: FormDefinition;
  try {
    definition = JSON.parse(json) as FormDefinition;
  } catch {
    console.error(`[genesis-sites] the form "${slug}" has an unreadable definition.`);
    return;
  }
  const layout = island.dataset.gsLayout === "focus" ? "focus" : "classic";
  const submitLabel = island.dataset.gsSubmitLabel;
  root.replaceChildren();
  createRoot(root).render(
    <Form
      form={definition}
      layout={layout}
      presentation="embedded"
      slots={siteFormSlots}
      {...(submitLabel ? { submitLabel } : {})}
      onSubmit={async (engine) => {
        const res = await fetch(submit, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ form: slug, answers: engine.answers() }),
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error(`The form couldn't be sent (${res.status}).`);
      }}
    />,
  );
});
