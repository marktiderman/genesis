/**
 * What every section is drawn with: headings at the level the page gives
 * them, links that are checked again when they render, images with alt text
 * and sizes, and the band that wraps a section. Server-safe: no state, no
 * effects. Classes are written out in full so the stylesheet build finds
 * them.
 */
import * as React from "react";
import { z } from "zod";
import { Band, BandLead, Display, type BandProps } from "@marktiderman/genesis-ui/band";
import { buttonVariants } from "@marktiderman/genesis-ui/button";
import { cn } from "@marktiderman/genesis-ui/utils";
import { responsiveImage } from "@marktiderman/genesis-media";
import {
  Activity,
  Award,
  Calendar,
  Check,
  Clock,
  Dumbbell,
  Heart,
  Leaf,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Shield,
  Smile,
  Sparkles,
  Star,
  Target,
  Trophy,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { RenderContext } from "../core/registry";
import { opensInNewTab, type FileRef, type Image, type Link, type SectionNode, type Surface } from "../core/schemas";
import { isExternalHref, isSafeHref, isSafeImageSrc } from "../core/urls";

// ── Props shared by section schemas ─────────────────────────────────────────

/** An in-page anchor (`#contact`): lowercase letters, digits and hyphens. */
export const Anchor = z
  .string()
  .regex(/^[a-z][a-z0-9-]{0,39}$/, "An anchor is lowercase letters, digits and hyphens.")
  .optional()
  .meta({ title: "Anchor (for #links)" });

export const ICONS = {
  activity: Activity,
  award: Award,
  calendar: Calendar,
  check: Check,
  clock: Clock,
  dumbbell: Dumbbell,
  heart: Heart,
  leaf: Leaf,
  mail: Mail,
  "map-pin": MapPin,
  message: MessageCircle,
  phone: Phone,
  shield: Shield,
  smile: Smile,
  sparkles: Sparkles,
  star: Star,
  target: Target,
  trophy: Trophy,
  users: Users,
  zap: Zap,
} satisfies Record<string, LucideIcon>;
export type IconName = keyof typeof ICONS;
export const IconName = z.enum(Object.keys(ICONS) as [IconName, ...IconName[]]).meta({ title: "Icon" });

// ── Links ───────────────────────────────────────────────────────────────────

/**
 * A stored link as it prints: checked again (a document that skipped the
 * schema can't smuggle `javascript:` in), with the host's base path on site
 * paths. An unsafe link renders as an inert `#` and is logged.
 */
export function resolveHref(href: string, ctx: RenderContext): string {
  if (!isSafeHref(href)) {
    console.error(`[genesis-sites] refused an unsafe link on ${ctx.pagePath}: ${JSON.stringify(String(href).slice(0, 80))}`);
    return "#";
  }
  return ctx.href(href);
}

/**
 * A link's attributes: its checked href, and for an http(s) link, `rel` and
 * `target`. An outbound link (`external`), or one that opens a new tab,
 * gets `rel="noopener noreferrer"` and `data-gs-outbound` (for analytics);
 * any other absolute link `rel="noopener"`. An outbound link whose href
 * isn't http(s) (a document that skipped the schema) renders inert.
 */
export function linkAttrs(link: Link, ctx: RenderContext, defaultEvent?: string): Record<string, string> {
  let href = resolveHref(link.href, ctx);
  const absolute = isExternalHref(href);
  if (link.external && !absolute) {
    console.error(`[genesis-sites] refused an outbound link that isn't http(s) on ${ctx.pagePath}.`);
    href = "#";
  }
  const newTab = absolute && opensInNewTab(link);
  const outbound = absolute && (link.external === true || newTab);
  const event = link.event ?? defaultEvent;
  return {
    href,
    ...(newTab ? { target: "_blank" } : {}),
    ...(outbound ? { rel: "noopener noreferrer", "data-gs-outbound": "" } : absolute ? { rel: "noopener" } : {}),
    ...(event ? { "data-gs-event": event } : {}),
  };
}

/** The attributes with the class before the analytics event, the order the markup has always had. */
function withEventLast(attrs: Record<string, string>, className: string): Record<string, string> {
  const { "data-gs-event": event, ...rest } = attrs;
  return { ...rest, className, ...(event ? { "data-gs-event": event } : {}) };
}

/** The visually hidden hint after a link that opens a new tab. */
function NewTabHint({ link }: { link: Link }) {
  return opensInNewTab(link) ? <span className="sr-only"> (opens in a new tab)</span> : null;
}

export type ButtonTone = "primary" | "secondary" | "outline" | "inverse" | "ghost";

const TONE: Record<ButtonTone, string> = {
  primary: buttonVariants({ variant: "default", size: "lg" }),
  secondary: buttonVariants({ variant: "secondary", size: "lg" }),
  outline: buttonVariants({ variant: "outline", size: "lg" }),
  // On an accent or inverse band: the band's foreground as the button, its background as the text.
  inverse: cn(buttonVariants({ variant: "default", size: "lg" }), "bg-background text-foreground hover:bg-background/90"),
  ghost: buttonVariants({ variant: "ghost", size: "lg" }),
};

/** A button's corners: the design system's, else genesis-ui's `rounded-md`. */
const BUTTON_RADIUS = "rounded-[var(--ds-radius-button,calc(var(--radius)_-_2px))]";

/** A link drawn as a button: at least 44px tall, with the focus ring. */
export function ButtonLink({ link, ctx, tone = "primary", className }: { link: Link; ctx: RenderContext; tone?: ButtonTone; className?: string }) {
  return (
    <a {...withEventLast(linkAttrs(link, ctx, "cta"), cn(TONE[tone], "min-h-11", BUTTON_RADIUS, className))}>
      {link.label}
      <NewTabHint link={link} />
    </a>
  );
}

/** A text link: underlined, at least 24px tall (WCAG 2.5.8). */
export function TextLink({ link, ctx, className }: { link: Link; ctx: RenderContext; className?: string }) {
  return (
    <a
      {...linkAttrs(link, ctx)}
      className={cn("inline-flex min-h-6 items-center rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring", className)}
    >
      {link.label}
      <NewTabHint link={link} />
    </a>
  );
}

export function Actions({ primary, secondary, ctx, onAccent, className }: { primary?: Link; secondary?: Link; ctx: RenderContext; onAccent?: boolean; className?: string }) {
  if (!primary && !secondary) return null;
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:flex-wrap", className)}>
      {primary ? <ButtonLink link={primary} ctx={ctx} tone={onAccent ? "inverse" : "primary"} /> : null}
      {secondary ? <ButtonLink link={secondary} ctx={ctx} tone={onAccent ? "ghost" : "outline"} className={onAccent ? "border border-current hover:bg-transparent hover:underline" : undefined} /> : null}
    </div>
  );
}

// ── Files ───────────────────────────────────────────────────────────────────

const FILE_KIND: Record<string, string> = {
  "application/pdf": "PDF",
  "image/png": "PNG image",
  "image/jpeg": "JPEG image",
  "image/webp": "WebP image",
  "image/avif": "AVIF image",
  "image/gif": "GIF image",
};

/** "PDF, 1.2 MB": what a download is, said beside its link. */
export function fileDescription(file: FileRef): string {
  const kind = FILE_KIND[file.mime] ?? "File";
  if (!file.bytes) return kind;
  const size = file.bytes >= 1024 * 1024 ? `${(file.bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(file.bytes / 1024))} KB`;
  return `${kind}, ${size}`;
}

/** A file's href: checked again, under the base path when it is a site path. Null when it isn't safe. */
export function fileHref(file: FileRef, ctx: RenderContext): string | null {
  if (!isSafeImageSrc(file.src)) {
    console.error(`[genesis-sites] refused an unsafe file link on ${ctx.pagePath}.`);
    return null;
  }
  return file.src.startsWith("/") ? ctx.href(file.src) : file.src;
}

// ── Images ──────────────────────────────────────────────────────────────────

export interface SiteImageProps {
  image: Image;
  className?: string;
  /** How wide the image shows, for the browser's pick from the `srcset` (only sent with one). */
  sizes?: string;
  /**
   * A large image (a hero, a half-width photo): the page's first one loads at
   * once at high priority, the rest lazily.
   */
  large?: boolean;
  /** Loads at once at normal priority, never lazily (the header's logo). */
  eager?: boolean;
  ctx: RenderContext;
}

/** Is this the page's first large image? Claims the page's one high-priority load. */
function claimPriority(ctx: RenderContext, large: boolean | undefined): boolean {
  if (!large || !ctx.media || ctx.media.firstLarge.claimed) return false;
  ctx.media.firstLarge.claimed = true;
  return true;
}

/**
 * An image with alt text (empty when decorative), its size to stop layout
 * shift, a `srcset` through the host's image URL builder, the focal point as
 * `object-position`, a phone crop as a `<picture>` source, and lazy loading
 * except for the page's first large image.
 */
export function SiteImage({ image, className, sizes, large, eager, ctx }: SiteImageProps) {
  if (!isSafeImageSrc(image.src) || (image.phone && !isSafeImageSrc(image.phone.src))) {
    console.error(`[genesis-sites] refused an unsafe image source on ${ctx.pagePath}.`);
    return null;
  }
  const at = (src: string) => (src.startsWith("/") ? ctx.href(src) : src);
  const priority = claimPriority(ctx, large);
  const r = responsiveImage(
    { ...image, src: at(image.src), ...(image.phone ? { phone: { ...image.phone, src: at(image.phone.src) } } : {}) },
    { ...(ctx.media ? { imageUrl: ctx.media.imageUrl } : {}), ...(sizes ? { sizes } : {}), priority, eager: eager ?? false },
  );
  const phonePosition = r.phone?.objectPosition && r.phone.objectPosition !== r.objectPosition ? r.phone.objectPosition : undefined;
  const style: React.CSSProperties & Record<string, string> = {
    ...(r.objectPosition ? { objectPosition: r.objectPosition } : {}),
    // A different focal point on phones: sites.css swaps it in under the phone width.
    ...(phonePosition ? { "--gs-pos-phone": phonePosition } : {}),
    ...(r.placeholder ? { backgroundImage: `url("${r.placeholder}")`, backgroundSize: "cover", backgroundPosition: r.objectPosition ?? "50% 50%" } : {}),
  };
  const img = (
    <img
      src={r.src}
      {...(r.srcset ? { srcSet: r.srcset } : {})}
      alt={r.alt}
      {...(r.width ? { width: r.width } : {})}
      {...(r.height ? { height: r.height } : {})}
      {...(r.sizes ? { sizes: r.sizes } : {})}
      loading={r.loading}
      decoding={r.decoding}
      {...(r.fetchpriority ? { fetchPriority: r.fetchpriority } : {})}
      style={Object.keys(style).length ? style : undefined}
      {...(phonePosition ? { "data-gs-phone-focal": "" } : {})}
      className={className}
    />
  );
  if (!r.phone) return img;
  return (
    <picture className="contents">
      <source
        media={r.phone.media}
        srcSet={r.phone.srcset ?? r.phone.src}
        {...(r.phone.sizes ? { sizes: r.phone.sizes } : {})}
        {...(r.phone.width ? { width: r.phone.width } : {})}
        {...(r.phone.height ? { height: r.phone.height } : {})}
      />
      {img}
    </picture>
  );
}

// ── Headings and bands ──────────────────────────────────────────────────────

/** The section's title, at the level the page gives it (h1 for the page's main heading). */
export function SectionTitle({ ctx, id, size, className, children }: { ctx: RenderContext; id: string; size?: "xl" | "lg" | "md" | "sm"; className?: string; children: React.ReactNode }) {
  // `data-gs-size` lets the design system's type ramp size it (sites.css), with today's size as the fallback.
  const step = size ?? (ctx.headingLevel === 1 ? "xl" : "lg");
  return (
    <Display as={ctx.headingLevel === 1 ? "h1" : "h2"} id={id} size={step} data-gs-size={step} className={className}>
      {children}
    </Display>
  );
}

/** An item's title inside a section: one level below the section's. */
export function ItemTitle({ ctx, className, children }: { ctx: RenderContext; className?: string; children: React.ReactNode }) {
  const Tag = ctx.headingLevel === 1 ? "h2" : "h3";
  return <Tag className={cn("font-display text-lg font-semibold leading-snug", className)}>{children}</Tag>;
}

export const titleId = (ctx: RenderContext, part = "title") => `${ctx.idPrefix}-${part}`;

const HIDE_ON: Record<string, string> = { mobile: "max-md:hidden", desktop: "md:hidden" };

/** Classes and attributes for a section's band: its anchor, `hideOn`, and the name from its title. */
export function bandAttrs(node: SectionNode, ctx: RenderContext, anchor: string | undefined, labelled = true): Partial<BandProps> & Record<string, unknown> {
  const hide = (node.hideOn ?? []).map((h) => HIDE_ON[h]).filter(Boolean).join(" ");
  return {
    ...(anchor ? { id: anchor } : {}),
    ...(labelled ? { "aria-labelledby": titleId(ctx) } : {}),
    "data-gs-section": node.type,
    "data-gs-variant": node.variant,
    className: cn(anchor ? "scroll-mt-20" : undefined, hide || undefined),
  };
}

/** The band a body section sits on, named by its title. */
export function SectionBand({
  node,
  ctx,
  anchor,
  surface = "base",
  spacing = "md",
  width = "lg",
  labelled = true,
  className,
  children,
}: {
  node: SectionNode;
  ctx: RenderContext;
  anchor?: string | undefined;
  surface?: Surface;
  spacing?: BandProps["spacing"];
  width?: BandProps["width"];
  labelled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const attrs = bandAttrs(node, ctx, anchor, labelled);
  return (
    <Band
      {...attrs}
      as={labelled ? "section" : "div"}
      surface={surface}
      spacing={spacing}
      // The design system's density sets the padding for this step (sites.css), with today's as the fallback.
      {...(spacing && spacing !== "none" ? { "data-gs-spacing": spacing } : {})}
      width={width}
      className={cn(attrs.className as string | undefined, className)}
    >
      {children}
    </Band>
  );
}

/** A section's heading block: an eyebrow, the title and a lead, centred or left. */
export function SectionIntro({
  ctx,
  eyebrow,
  heading,
  body,
  align = "center",
  tone = "muted",
  size,
}: {
  ctx: RenderContext;
  eyebrow?: string | undefined;
  heading?: string | undefined;
  body?: string | undefined;
  align?: "center" | "left";
  tone?: "muted" | "inherit";
  size?: "xl" | "lg" | "md" | "sm";
}) {
  if (!heading && !body) return null;
  return (
    <div className={cn("flex max-w-3xl flex-col gap-4", align === "center" ? "mx-auto items-center text-center" : "items-start text-left")}>
      {eyebrow ? <p data-gs-text="eyebrow" className="text-sm font-semibold uppercase tracking-wider">{eyebrow}</p> : null}
      {heading ? (
        <SectionTitle ctx={ctx} id={titleId(ctx)} size={size}>
          {heading}
        </SectionTitle>
      ) : null}
      {body ? <BandLead data-gs-text="lead" tone={tone}>{body}</BandLead> : null}
    </div>
  );
}

/** A section with no visible title still needs a name: a visually hidden one. */
export function HiddenTitle({ ctx, children }: { ctx: RenderContext; children: React.ReactNode }) {
  const Tag = ctx.headingLevel === 1 ? "h1" : "h2";
  return (
    <Tag id={titleId(ctx)} className="sr-only">
      {children}
    </Tag>
  );
}

export const onAccent = (surface: Surface | undefined) => surface === "accent" || surface === "inverse";
