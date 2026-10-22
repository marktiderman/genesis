/**
 * The sample app's form templates. Genesis ships only a blank template in
 * `TEMPLATES`, plus opt-in neutral `STARTER_TEMPLATES`; an app adds starting
 * points that fit its domain and passes the list on.
 */
import { STARTER_TEMPLATES, TEMPLATES, type FormTemplate } from "@marktiderman/genesis-forms-builder";

export const SAMPLE_TEMPLATES: readonly FormTemplate[] = [...TEMPLATES, ...STARTER_TEMPLATES];
