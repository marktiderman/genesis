/**
 * The documents a site is made of, as zod 4 schemas: a `SiteDoc` (theme,
 * header, navigation, footer, SEO defaults, redirects), one `PageDoc` per
 * page (its sections and SEO), and the `ReleaseSnapshot` a publish freezes.
 *
 * A page's `content` is an array of `{ id, type, v, variant, props }`
 * section nodes, which is the shape Puck's `content` uses, so the editor
 * reads and writes these documents unchanged. A section's `props` are
 * checked by that section's own schema (see `defineSection`), not here.
 */
import { z } from "zod";
import { MAX_URL_LENGTH, PAGE_PATH, isSafeHref, isSafeImageSrc } from "./urls";

/** zod 4 is required: `z.toJSONSchema` (editor fields, AI output) exists only there. */
if (typeof (z as { toJSONSchema?: unknown }).toJSONSchema !== "function") {
  throw new Error("@marktiderman/genesis-sites needs zod 4 (zod@^4.0.0): z.toJSONSchema is missing.");
}

// ── Building blocks for section schemas ─────────────────────────────────────

/** A link target: a site path, a fragment, or an http(s), mailto or tel URL. */
export const Href = z
  .string()
  .max(MAX_URL_LENGTH)
  .refine(isSafeHref, { message: "Use a site path (/about), a #section, or an https, mailto or tel link." })
  .meta({ title: "Link", format: "uri-reference" });

/** An analytics event name for a link: `data-gs-event` on the page (default `cta` on buttons). */
export const LinkEvent = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_.:-]{0,47}$/, "An event name is lowercase letters, digits and _ . : -")
  .meta({ title: "Analytics event" });

/**
 * A labelled link: a button, a menu entry, a footer link, an outbound
 * booking link.
 *
 * - `external: true` marks a link that leaves the site (a booking or
 *   membership system): it must be an `http(s)` URL, and it renders with
 *   `rel="noopener noreferrer"` and `data-gs-outbound` for analytics.
 * - `target` (`_blank` for a new tab) applies to http(s) links only;
 *   `newTab: true` is the older spelling of `target: "_blank"`.
 * - `event` names the click for the host's analytics (`data-gs-event`).
 */
export const Link = z
  .object({
    label: z.string().trim().min(1).max(80),
    href: Href,
    /** Opens in a new tab (http(s) links only). The same as `target: "_blank"`. */
    newTab: z.boolean().optional(),
    /** Where an http(s) link opens: this tab (`_self`, the default) or a new one (`_blank`). */
    target: z.enum(["_self", "_blank"]).optional().meta({ title: "Opens in" }),
    /** A link that leaves the site (a booking system): http(s) only, `rel="noopener noreferrer"`. */
    external: z.boolean().optional().meta({ title: "Outbound link" }),
    event: LinkEvent.optional(),
  })
  .refine((link) => !link.external || /^https?:\/\//i.test(link.href), { message: "An outbound link is an http(s) URL.", path: ["href"] })
  .meta({ title: "Link" });
export type Link = z.infer<typeof Link>;

/** Does this link open in a new tab? Only an http(s) link can. */
export const opensInNewTab = (link: Pick<Link, "href" | "newTab" | "target">): boolean =>
  /^https?:\/\//i.test(link.href) && (link.target === "_blank" || (link.target === undefined && link.newTab === true));

/**
 * A downloadable file (a PDF timetable, a waiver): a site path (an upload
 * under `sites/<site_id>/files/`) or an https URL. `bytes` and `mime` say
 * what the visitor is about to download.
 */
export const FileRef = z
  .object({
    src: z
      .string()
      .max(MAX_URL_LENGTH)
      .refine(isSafeImageSrc, { message: "A file loads from a site path or an https URL." }),
    /** The file's type; PDF unless it is an image. */
    mime: z.enum(["application/pdf", "image/png", "image/jpeg", "image/webp", "image/avif", "image/gif"]).default("application/pdf"),
    /** Its size, shown beside the link ("PDF, 1.2 MB"). */
    bytes: z.number().int().positive().max(100 * 1024 * 1024).optional(),
  })
  .meta({ title: "File", "x-genesis-kind": "file" });
export type FileRef = z.infer<typeof FileRef>;

/**
 * An image. `alt` describes it for someone who can't see it; an image that
 * adds nothing (a texture) is `decorative: true` and gets an empty alt. The
 * accessibility check refuses to publish an image with neither.
 */
export const Image = z
  .object({
    src: z
      .string()
      .max(MAX_URL_LENGTH)
      .refine(isSafeImageSrc, { message: "An image loads from a site path or an https URL." }),
    alt: z.string().max(300).default(""),
    decorative: z.boolean().optional(),
    width: z.number().int().positive().max(10000).optional(),
    height: z.number().int().positive().max(10000).optional(),
    /** Where the subject is, for cropping: 0–100 from the left and top. */
    focal: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }).optional(),
  })
  .meta({ title: "Image", "x-genesis-kind": "image" });
export type Image = z.infer<typeof Image>;

/**
 * Rich text: the JSON genesis-ui's `RichTextEditor` (TipTap) produces. Only
 * its outline is checked here; genesis-ui's `RichText` sanitizes it again
 * when it renders, so a stored document can never carry raw HTML.
 */
export const RichText = z
  .object({
    type: z.literal("doc"),
    content: z.array(z.record(z.string(), z.unknown())).max(2000).optional(),
  })
  .meta({ title: "Rich text", "x-genesis-kind": "rich-text" });
export type RichText = z.infer<typeof RichText>;

/** The band a section sits on. */
export const Surface = z.enum(["base", "muted", "accent", "inverse"]).meta({ title: "Background" });
export type Surface = z.infer<typeof Surface>;

/** A short line of copy (a heading, a label). */
export const Line = (max = 120) => z.string().trim().min(1).max(max);
/** A paragraph of plain copy. */
export const Copy = (max = 600) => z.string().trim().max(max);

// ── Section nodes and pages ─────────────────────────────────────────────────

/** A section's id: stable, letters, digits, `-` and `_` (Shopify's rule). */
export const SectionId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "A section id is 1–64 letters, digits, - or _.");

export const SectionNode = z.object({
  id: SectionId,
  /** The section's registry key, such as `hero`. */
  type: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  /** The props version the props were written at; `migrateNode` brings them up to date. */
  v: z.number().int().min(1),
  variant: z.string().max(64).optional(),
  /** Kept in the page, not rendered (Shopify's `disabled`). */
  hidden: z.boolean().optional(),
  /** Hidden on phones or on wider screens. */
  hideOn: z.array(z.enum(["mobile", "desktop"])).max(2).optional(),
  /**
   * Set by a template on content someone must replace (a sample quote). The
   * publish check refuses a visible section that still has it; the editor
   * clears it once the section is edited.
   */
  placeholder: z.boolean().optional(),
  props: z.record(z.string(), z.unknown()),
});
export type SectionNode = z.infer<typeof SectionNode>;

export const Seo = z.object({
  title: z.string().trim().max(70).optional(),
  description: z.string().trim().max(200).optional(),
  ogImage: Image.optional(),
  /** An absolute canonical URL, when this page's content lives elsewhere. */
  canonical: z.url({ protocol: /^https?$/ }).max(MAX_URL_LENGTH).optional(),
  noindex: z.boolean().optional(),
});
export type Seo = z.infer<typeof Seo>;

export const PageDoc = z.object({
  schemaVersion: z.literal(1),
  root: z.object({
    props: z.looseObject({
      title: z.string().trim().min(1).max(120),
      /** Leave out the site's header and footer (a focused landing page). */
      hideSiteChrome: z.boolean().optional(),
    }),
  }),
  content: z.array(SectionNode).max(60),
  seo: Seo.optional(),
});
export type PageDoc = z.infer<typeof PageDoc>;

/**
 * What a page is: an ordinary `page`, a focused `landing` page, or the
 * `post` page: the template every blog post renders in. A site has at most
 * one post page; at its own path (`/blog`) it is the blog's index, and at
 * `/blog/<slug>` it shows that post in its `post-body` section.
 */
export const PageKind = z.enum(["page", "landing", "post"]);
export type PageKind = z.infer<typeof PageKind>;

export const PagePath = z.string().max(200).regex(PAGE_PATH, 'A page path looks like "/" or "/about".');

// ── The site ────────────────────────────────────────────────────────────────

export const MenuItem = z.object({
  label: z.string().trim().min(1).max(40),
  href: Href,
});
export type MenuItem = z.infer<typeof MenuItem>;

export const Redirect = z.object({
  from: PagePath,
  to: Href,
  status: z.union([z.literal(301), z.literal(302)]),
});
export type Redirect = z.infer<typeof Redirect>;

/** Fonts a site may choose for its headings; see `FONT_CHOICES` in theme.ts for their stacks. */
export const FontChoice = z.enum([
  "system",
  "inter",
  "dm-sans",
  "work-sans",
  "montserrat",
  "poppins",
  "space-grotesk",
  "source-serif",
  "merriweather",
  "playfair-display",
  "lora",
  "barlow",
  "barlow-condensed",
  "oswald",
  "roboto-condensed",
  "bebas-neue",
]);
export type FontChoice = z.infer<typeof FontChoice>;

/** Fonts a site may choose for its body text: every choice but the display faces that have one weight. */
export const BodyFontChoice = FontChoice.exclude(["bebas-neue"]);
export type BodyFontChoice = z.infer<typeof BodyFontChoice>;

/**
 * A site's theme choices on top of the brand: token choices only, never raw
 * CSS, so a site stays inside the design system.
 */
export const TokenOverrides = z.object({
  radius: z.enum(["none", "sm", "md", "lg", "full"]).optional(),
  headingFont: FontChoice.optional(),
  bodyFont: BodyFontChoice.optional(),
});
export type TokenOverrides = z.infer<typeof TokenOverrides>;

export const SeoDefaults = z.object({
  /** `%s` is the page's title: `"%s · Riverside Works"`. */
  titleTemplate: z.string().max(80).optional(),
  description: z.string().trim().max(200).optional(),
  ogImage: Image.optional(),
  /** Organization facts for JSON-LD. */
  organization: z
    .object({
      name: z.string().trim().min(1).max(120),
      logo: z.string().max(MAX_URL_LENGTH).refine(isSafeImageSrc).optional(),
      sameAs: z.array(z.url({ protocol: /^https$/ }).max(MAX_URL_LENGTH)).max(10).optional(),
    })
    .optional(),
  noindex: z.boolean().optional(),
});
export type SeoDefaults = z.infer<typeof SeoDefaults>;

export const SiteDoc = z.object({
  schemaVersion: z.literal(1),
  name: z.string().trim().min(1).max(120),
  /** BCP 47 language of the site's pages. */
  lang: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/).default("en"),
  theme: z
    .object({
      colorScheme: z.enum(["light", "dark", "auto"]).default("light"),
      overrides: TokenOverrides.optional(),
    })
    .default({ colorScheme: "light" }),
  /** The site's header: usually one `nav` section. */
  header: z.array(SectionNode).max(2).default([]),
  /** The header's menu. */
  nav: z.array(MenuItem).max(12).default([]),
  /** The site's footer: usually one `footer` section. */
  footer: z.array(SectionNode).max(3).default([]),
  seo: SeoDefaults.default({}),
  redirects: z.array(Redirect).max(500).default([]),
  /**
   * Where the site's images and files may load from. `"own"`: only the site
   * itself and the store's asset origin. An image elsewhere then blocks the
   * publish, and the page's Content-Security-Policy refuses other hosts.
   * Unset: any https host, and an image elsewhere is a warning.
   */
  images: z.enum(["any", "own"]).optional(),
});
export type SiteDoc = z.infer<typeof SiteDoc>;
/** A `SiteDoc` as written, before defaults. */
export type SiteDocInput = z.input<typeof SiteDoc>;

// ── Releases ────────────────────────────────────────────────────────────────

export const ReleasePage = z.object({
  id: z.string().min(1),
  path: PagePath,
  kind: PageKind,
  doc: PageDoc,
});
export type ReleasePage = z.infer<typeof ReleasePage>;

/** Everything a published site serves: the site document and every page, frozen at publish. */
export const ReleaseSnapshot = z.object({
  schemaVersion: z.literal(1),
  site: SiteDoc,
  pages: z.array(ReleasePage).max(500),
});
export type ReleaseSnapshot = z.infer<typeof ReleaseSnapshot>;

/**
 * Read a stored snapshot page by page: a page that no longer parses (a
 * schema this release tightened, a document written past the checks) is
 * left out and reported, so one bad page doesn't take the whole site down.
 * Null only when the site document itself doesn't parse.
 */
export function parseSnapshot(value: unknown, report: (message: string) => void = (m) => console.error(`[genesis-sites] ${m}`)): ReleaseSnapshot | null {
  const raw = value && typeof value === "object" ? (value as { schemaVersion?: unknown; site?: unknown; pages?: unknown }) : {};
  if (raw.schemaVersion !== 1) {
    report("the snapshot isn't schemaVersion 1.");
    return null;
  }
  const site = SiteDoc.safeParse(raw.site);
  if (!site.success) {
    report(`the snapshot's site document doesn't parse: ${site.error.message}`);
    return null;
  }
  const pages: ReleasePage[] = [];
  for (const page of Array.isArray(raw.pages) ? raw.pages.slice(0, 500) : []) {
    const parsed = ReleasePage.safeParse(page);
    if (parsed.success) pages.push(parsed.data);
    else report(`the page ${JSON.stringify((page as { path?: unknown })?.path ?? "?")} doesn't parse and is left out: ${parsed.error.message}`);
  }
  return { schemaVersion: 1, site: site.data, pages };
}

export interface ReleaseMeta {
  id: string;
  siteId: string;
  number: number;
  note: string | null;
  createdAt: string;
  publishedAt: string | null;
  /** The brand the release was checked against (`brandHash`), when known. */
  brandHash: string | null;
}

export interface Release extends ReleaseMeta {
  snapshot: ReleaseSnapshot;
}

export interface PageMeta {
  id: string;
  siteId: string;
  path: string;
  kind: PageKind;
  title: string;
  sort: number;
  rev: number;
}

/** The size limit of one stored document, as the database enforces it (512 KiB of JSON). */
export const MAX_DOC_BYTES = 512 * 1024;
