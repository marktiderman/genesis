/**
 * Templates: whole sites from a little input.
 *
 * - `landingPage`: the one-click landing page from a brand and a message.
 *   Nav, hero, features, testimonials, a call to action, a form embed and a
 *   footer, on one page.
 * - `onePageSite`: the smallest site a brand with no site can be seeded
 *   with: just a name, a logo, a message, and the brand's colours and fonts.
 * - `starterSite`: three pages (home, about, contact) with nav and footer.
 *
 * Each returns documents (`site`, `pages`) for any `SiteStore` to create.
 * Nothing is invented and passed off as real: copy a template can't know
 * (a client's quote, a statistic) is marked `placeholder`, and the publish
 * check refuses it until someone replaces it or hides the section.
 */
import type { Link, PageDoc, PageKind, SectionNode, SiteDocInput } from "./schemas";
import { brandDisplayName, type BrandInput, type SiteBrand } from "./theme";

export interface TemplateMessage {
  /** The hero's headline: what you do, for whom. */
  headline: string;
  /** One or two sentences under it. */
  subhead?: string;
  /** The main button. Default: "Get in touch", to the form (or `#contact`). */
  cta?: Link;
  /** What you offer, as the features band. Without it the band is a placeholder to fill in. */
  benefits?: { title: string; body: string }[];
}

export interface TemplateInput {
  brand: BrandInput;
  message: TemplateMessage;
  /** A form to embed (its slug, for the host's forms resolver). */
  form?: { slug: string; heading?: string; body?: string };
  /** For the footer. */
  contact?: { email?: string; phone?: string };
}

export interface TemplateResult {
  site: SiteDocInput;
  pages: { path: string; kind: PageKind; doc: PageDoc }[];
}

const year = () => new Date().getUTCFullYear();

function node(id: string, type: string, variant: string, props: Record<string, unknown>, extra: Partial<SectionNode> = {}): SectionNode {
  return { id, type, v: 1, variant, props, ...extra };
}

function footerNode(name: string, contact: TemplateInput["contact"], variant = "simple"): SectionNode {
  const links: Link[] = [];
  if (contact?.email) links.push({ label: contact.email, href: `mailto:${contact.email}` });
  if (contact?.phone) links.push({ label: contact.phone, href: `tel:${contact.phone.replace(/[^+\d]/g, "")}` });
  return node("footer", "footer", variant, {
    ...(links.length ? { links } : {}),
    copyright: `© ${year()} ${name}`,
  });
}

function seo(name: string, message: TemplateMessage) {
  return {
    titleTemplate: `%s · ${name}`,
    ...(message.subhead ? { description: message.subhead.slice(0, 200) } : {}),
    organization: { name },
  };
}

function primaryCta(input: TemplateInput): Link {
  return input.message.cta ?? { label: "Get in touch", href: "#contact" };
}

function benefitsNode(message: TemplateMessage): SectionNode {
  if (message.benefits?.length) {
    return node("features", "features", "grid", {
      heading: "What you get",
      items: message.benefits.slice(0, 12).map((b, i) => ({ title: b.title, body: b.body, icon: (["check", "star", "heart", "zap", "shield", "clock"] as const)[i % 6] })),
    });
  }
  return node(
    "features",
    "features",
    "grid",
    {
      heading: "What you get",
      items: [
        { title: "Your first offer", body: "Say what someone gets and why it matters to them.", icon: "check" },
        { title: "Your second offer", body: "Keep each one to a sentence or two.", icon: "star" },
        { title: "Your third offer", body: "Three is plenty for a landing page.", icon: "heart" },
      ],
    },
    { placeholder: true },
  );
}

const testimonialsNode = () =>
  node(
    "testimonials",
    "testimonials",
    "grid",
    {
      heading: "What people say",
      items: [
        { quote: "Add a quote from someone you have helped, in their words and with their permission.", name: "Their name", role: "What they did with you" },
        { quote: "A second quote, from someone different.", name: "Their name" },
      ],
    },
    { placeholder: true },
  );

function formNode(input: TemplateInput): SectionNode | null {
  if (!input.form) return null;
  return node("contact", "form-embed", "split", {
    heading: input.form.heading ?? "Get in touch",
    ...(input.form.body ? { body: input.form.body } : { body: "Tell us a little about yourself and we'll get back to you." }),
    form: input.form.slug,
    anchor: "contact",
  });
}

/**
 * The one-click landing page: brand plus message, on one page.
 *
 * @stability Beta
 */
export function landingPage(input: TemplateInput): TemplateResult {
  const name = brandDisplayName(input.brand);
  const cta = primaryCta(input);
  const form = formNode(input);
  const content: SectionNode[] = [
    node("hero", "hero", "centered", {
      heading: input.message.headline,
      ...(input.message.subhead ? { body: input.message.subhead } : {}),
      primaryCta: cta,
    }),
    benefitsNode(input.message),
    testimonialsNode(),
    node("cta", "cta", "banner", { heading: "Ready when you are", primaryCta: cta, surface: "accent" }),
  ];
  if (form) content.push(form);
  return {
    site: {
      schemaVersion: 1,
      name,
      header: [node("nav", "nav", "minimal", { cta })],
      nav: [],
      footer: [footerNode(name, input.contact, "minimal")],
      seo: seo(name, input.message),
    },
    pages: [{ path: "/", kind: "landing", doc: { schemaVersion: 1, root: { props: { title: input.message.headline.slice(0, 120) } }, content, seo: input.message.subhead ? { description: input.message.subhead.slice(0, 200) } : undefined } }],
  };
}

export interface OnePageSiteInput {
  name: string;
  logo?: { src: string; alt?: string };
  message: TemplateMessage;
  /** The brand's colours and fonts. */
  colors: SiteBrand["colors"];
  fonts?: SiteBrand["fonts"];
  contact?: TemplateInput["contact"];
}

/**
 * The smallest site, for seeding a brand that has none: a header, a hero,
 * a call to action and a footer. `brand` is the minimal brand to store
 * beside it (the host's `BrandSource` returns it).
 *
 * @stability Beta
 */
export function onePageSite(input: OnePageSiteInput): TemplateResult & { brand: SiteBrand } {
  const brand: SiteBrand = { name: input.name, colors: input.colors, ...(input.fonts ? { fonts: input.fonts } : {}), ...(input.logo ? { logo: input.logo } : {}) };
  const cta = input.message.cta ?? (input.contact?.email ? { label: "Email us", href: `mailto:${input.contact.email}` } : { label: "Get in touch", href: "#contact" });
  return {
    brand,
    site: {
      schemaVersion: 1,
      name: input.name,
      header: [node("nav", "nav", "minimal", { cta })],
      nav: [],
      footer: [footerNode(input.name, input.contact)],
      seo: seo(input.name, input.message),
    },
    pages: [
      {
        path: "/",
        kind: "page",
        doc: {
          schemaVersion: 1,
          root: { props: { title: input.message.headline.slice(0, 120) } },
          content: [
            node("hero", "hero", "centered", {
              heading: input.message.headline,
              ...(input.message.subhead ? { body: input.message.subhead } : {}),
              primaryCta: cta,
            }),
            node("contact", "cta", "card", { heading: `Talk to ${input.name}`, primaryCta: cta, anchor: "contact" }),
          ],
          ...(input.message.subhead ? { seo: { description: input.message.subhead.slice(0, 200) } } : {}),
        },
      },
    ],
  };
}

/**
 * A three-page starter site: home, about and contact, with the menu, a
 * footer and redirects-ready paths.
 *
 * @stability Beta
 */
export function starterSite(input: TemplateInput): TemplateResult {
  const name = brandDisplayName(input.brand);
  const cta: Link = input.message.cta ?? { label: "Contact us", href: "/contact" };
  const form = formNode(input);
  const page = (title: string, content: SectionNode[], description?: string): PageDoc => ({
    schemaVersion: 1,
    root: { props: { title } },
    content,
    ...(description ? { seo: { description } } : {}),
  });
  return {
    site: {
      schemaVersion: 1,
      name,
      header: [node("nav", "nav", "simple", { cta })],
      nav: [
        { label: "Home", href: "/" },
        { label: "About", href: "/about" },
        { label: "Contact", href: "/contact" },
      ],
      footer: [
        node("footer", "footer", "columns", {
          tagline: input.message.subhead?.slice(0, 200),
          columns: [
            { heading: name, links: [{ label: "About", href: "/about" }, { label: "Contact", href: "/contact" }] },
            ...(input.contact?.email || input.contact?.phone
              ? [
                  {
                    heading: "Get in touch",
                    links: [
                      ...(input.contact.email ? [{ label: input.contact.email, href: `mailto:${input.contact.email}` }] : []),
                      ...(input.contact.phone ? [{ label: input.contact.phone, href: `tel:${input.contact.phone.replace(/[^+\d]/g, "")}` }] : []),
                    ],
                  },
                ]
              : []),
          ],
          copyright: `© ${year()} ${name}`,
        }),
      ],
      seo: seo(name, input.message),
    },
    pages: [
      {
        path: "/",
        kind: "page",
        doc: page(
          "Home",
          [
            node("hero", "hero", "split", {
              heading: input.message.headline,
              ...(input.message.subhead ? { body: input.message.subhead } : {}),
              primaryCta: cta,
              secondaryCta: { label: "About us", href: "/about" },
            }),
            benefitsNode(input.message),
            testimonialsNode(),
            node("cta", "cta", "banner", { heading: "Come and see for yourself", primaryCta: cta, surface: "accent" }),
          ],
          input.message.subhead?.slice(0, 200),
        ),
      },
      {
        path: "/about",
        kind: "page",
        doc: page(
          "About",
          [
            node("hero", "hero", "centered", { eyebrow: "About", heading: `About ${name}` }),
            node(
              "story",
              "rich-text",
              "narrow",
              {
                body: {
                  type: "doc",
                  content: [
                    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Our story" }] },
                    { type: "paragraph", content: [{ type: "text", text: "Tell people how you started, who you help and what you believe." }] },
                  ],
                },
              },
              { placeholder: true },
            ),
          ],
          `About ${name}.`,
        ),
      },
      {
        path: "/contact",
        kind: "page",
        doc: page(
          "Contact",
          [
            node("hero", "hero", "centered", { eyebrow: "Contact", heading: "Get in touch", ...(input.message.subhead ? { body: input.message.subhead } : {}) }),
            ...(form ? [form] : [node("contact", "cta", "card", { heading: `Talk to ${name}`, primaryCta: input.contact?.email ? { label: "Email us", href: `mailto:${input.contact.email}` } : cta })]),
          ],
          `How to reach ${name}.`,
        ),
      },
    ],
  };
}
