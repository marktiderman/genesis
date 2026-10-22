/**
 * Starting points for a new form. Each `create()` returns a fresh, valid
 * definition with a new form id; block ids inside a template are fixed, which
 * is fine because answers are only compared within one form.
 *
 * The builder ships only `BLANK_TEMPLATE`. Hosts define their own templates
 * (as `FormTemplate`s) and pass them to `getTemplate` or their own picker.
 */
import type { FormDefinition } from "@marktiderman/genesis-forms";
import { emptyForm } from "./ops";

export interface FormTemplate {
  id: string;
  name: string;
  description: string;
  create: () => FormDefinition;
}

/** An empty form: the one built-in starting point. */
export const BLANK_TEMPLATE: FormTemplate = {
  id: "blank",
  name: "Blank form",
  description: "Start from nothing.",
  create: () => emptyForm(),
};

/** The built-in templates: just `BLANK_TEMPLATE`. Spread it into your own list: `[...TEMPLATES, ...mine]`. */
export const TEMPLATES: readonly FormTemplate[] = [BLANK_TEMPLATE];

/** Find a template by id in `templates` (default: the built-ins). */
export const getTemplate = (id: string, templates: readonly FormTemplate[] = TEMPLATES): FormTemplate | undefined =>
  templates.find((t) => t.id === id);
