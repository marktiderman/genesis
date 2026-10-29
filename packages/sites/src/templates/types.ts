/**
 * The shape of a template module: plain data on the neutral sections. Not the
 * final template format (content packs come later); just presets a host can
 * offer beside the built-in ones, and sample data for demos.
 */
import type { BuiltInSectionType, SectionPreset } from "../core/registry";
import type { SiteBrand } from "../core/theme";
import type { TemplateMessage } from "../core/templates";

export interface IndustryTemplate {
  /** A stable id: lowercase letters and hyphens. */
  readonly id: string;
  /** Its name in a picker. */
  readonly label: string;
  /** A made-up brand for demos. */
  readonly brand: SiteBrand;
  /** Sample copy for `landingPage`, `onePageSite` and `starterSite`. */
  readonly message: TemplateMessage;
  /** Presets per built-in section, on the section's own preset shape; each parses with that section's schema. */
  readonly presets: Partial<Record<BuiltInSectionType, readonly SectionPreset[]>>;
}
