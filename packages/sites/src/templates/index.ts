/**
 * @marktiderman/genesis-sites/templates: industry template content.
 *
 * The core (schemas, sections, the editor, defaults) never names an industry.
 * Industry flavour lives here, as data on the neutral sections: presets per
 * section and sample data. Nothing here is a code path; a section renders the
 * same whichever template its props came from. The businesses are made up.
 *
 * Industry design systems (`forgeDesignSystem`, `studioDesignSystem`) are here
 * too: tokens only. Register the ones you offer with genesis-design-system's
 * `registerDesignSystem(...industryDesignSystems)`.
 *
 * @packageDocumentation
 */
export type { IndustryTemplate } from "./types";
export { fitness } from "./fitness";
export { forgeDesignSystem, industryDesignSystems, studioDesignSystem } from "./design-systems";

import { fitness } from "./fitness";
import type { IndustryTemplate } from "./types";

/** Every template in this package, by id. */
export const industryTemplates: Readonly<Record<string, IndustryTemplate>> = Object.freeze({ [fitness.id]: fitness });
