/**
 * @marktiderman/genesis-sites/sections: the built-in section catalog.
 *
 * Importing this module registers the 13 built-in sections (unless a host
 * registered a replacement first, with `{ replace: true }`). Each is
 * server-safe React on genesis-ui's `Band` and `Display`, mobile first, with
 * 2–4 variants and presets for the editor's Add picker.
 *
 * @packageDocumentation
 */
import { registerBuiltInSection, type AnySectionDefinition } from "../core/registry";
import { ctaSection } from "./cta";
import { faqSection } from "./faq";
import { featuresSection } from "./features";
import { footerSection } from "./footer";
import { formEmbedSection } from "./form-embed";
import { gallerySection } from "./gallery";
import { heroSection } from "./hero";
import { logosSection } from "./logos";
import { navSection } from "./nav";
import { pricingSection } from "./pricing";
import { richTextSection } from "./rich-text";
import { statsSection } from "./stats";
import { testimonialsSection } from "./testimonials";

/** The built-in sections, in the editor's order. */
export const builtInSections: readonly AnySectionDefinition[] = Object.freeze([
  navSection,
  heroSection,
  featuresSection,
  ctaSection,
  testimonialsSection,
  faqSection,
  pricingSection,
  logosSection,
  statsSection,
  gallerySection,
  richTextSection,
  formEmbedSection,
  footerSection,
] as AnySectionDefinition[]);

for (const def of builtInSections) registerBuiltInSection(def);

export {
  ctaSection,
  faqSection,
  featuresSection,
  footerSection,
  formEmbedSection,
  gallerySection,
  heroSection,
  logosSection,
  navSection,
  pricingSection,
  richTextSection,
  statsSection,
  testimonialsSection,
};
export { ICONS, IconName, Anchor, ButtonLink, TextLink, SiteImage, SectionBand, SectionIntro, SectionTitle, ItemTitle, HiddenTitle, resolveHref, titleId } from "./shared";
export { SiteFormHeader, siteFormSlots } from "./form-header";
