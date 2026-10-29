/**
 * @marktiderman/genesis-sites/templates: industry template content.
 *
 * The core (schemas, sections, the editor, defaults) never names an industry.
 * Industry flavour lives here, as data on the neutral sections: presets per
 * section and sample data. Nothing here is a code path; a section renders the
 * same whichever template its props came from. The businesses are made up.
 *
 * @packageDocumentation
 */
export type { IndustryTemplate } from "./types";
export { fitness } from "./fitness";

import { fitness } from "./fitness";
import type { IndustryTemplate } from "./types";

/** Every template in this package, by id. */
export const industryTemplates: Readonly<Record<string, IndustryTemplate>> = Object.freeze({ [fitness.id]: fitness });
