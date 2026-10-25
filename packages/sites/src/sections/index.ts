/**
 * @marktiderman/genesis-sites/sections: the built-in section catalog.
 *
 * Importing this module registers the 20 built-in sections (unless a host
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
import { blogListSection } from "./blog-list";
import { fileSection } from "./file";
import { mapSection } from "./map";
import { postBodySection } from "./post-body";
import { scheduleSection } from "./schedule";
import { teamSection } from "./team";
import { timelineSection } from "./timeline";

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
  scheduleSection,
  teamSection,
  blogListSection,
  postBodySection,
  mapSection,
  timelineSection,
  fileSection,
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
  scheduleSection,
  teamSection,
  blogListSection,
  postBodySection,
  mapSection,
  timelineSection,
  fileSection,
};
export { formatTime, WEEKDAYS, CHIP_TONES, type ScheduleSession, type Weekday } from "./schedule";
export { formatPostDate } from "./blog-list";
export { MAP_PROVIDERS, mapEmbedUrl, mapPageUrl, type MapProvider } from "./map";
export { ICONS, IconName, Anchor, ButtonLink, TextLink, SiteImage, SectionBand, SectionIntro, SectionTitle, ItemTitle, HiddenTitle, resolveHref, linkAttrs, fileDescription, fileHref, titleId } from "./shared";
export { SiteFormHeader, siteFormSlots } from "./form-header";
