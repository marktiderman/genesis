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
import type { Image, Link, SectionNode, Surface } from "../core/schemas";
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

function linkAttrs(link: Link, ctx: RenderContext) {
  const href = resolveHref(link.href, ctx);
  const external = isExternalHref(href);
  return {
    href,
    ...(external && link.newTab ? { target: "_blank", rel: "noopener noreferrer" } : external ? { rel: "noopener" } : {}),
  };
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

/** A link drawn as a button: at least 44px tall, with the focus ring. */
export function ButtonLink({ link, ctx, tone = "primary", className }: { link: Link; ctx: RenderContext; tone?: ButtonTone; className?: string }) {
  return (
    <a {...linkAttrs(link, ctx)} className={cn(TONE[tone], "min-h-11", className)} data-gs-event="cta">
      {link.label}
      {link.newTab && isExternalHref(link.href) ? <span className="sr-only"> (opens in a new tab)</span> : null}
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
      {link.newTab && isExternalHref(link.href) ? <span className="sr-only"> (opens in a new tab)</span> : null}
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

// ── Images ──────────────────────────────────────────────────────────────────

export interface SiteImageProps {
  image: Image;
  className?: string;
  /** `sizes` for the browser's pick; the image is one source here (image CDN transforms are V1). */
  sizes?: string;
  /** The page's largest image (a hero): loaded eagerly, at high priority. */
  priority?: boolean;
  ctx: RenderContext;
}

/** An image with alt text (empty when decorative), its size to stop layout shift, and lazy loading below the fold. */
export function SiteImage({ image, className, sizes, priority, ctx }: SiteImageProps) {
  if (!isSafeImageSrc(image.src)) {
    console.error(`[genesis-sites] refused an unsafe image source on ${ctx.pagePath}.`);
    return null;
  }
  const src = image.src.startsWith("/") ? ctx.href(image.src) : image.src;
  return (
    <img
      src={src}
      alt={image.decorative ? "" : image.alt}
      {...(image.width ? { width: image.width } : {})}
      {...(image.height ? { height: image.height } : {})}
      {...(sizes ? { sizes } : {})}
      loading={priority ? "eager" : "lazy"}
      decoding={priority ? "sync" : "async"}
      {...(priority ? { fetchPriority: "high" as const } : {})}
      style={image.focal ? { objectPosition: `${image.focal.x}% ${image.focal.y}%` } : undefined}
      className={className}
    />
  );
}

// ── Headings and bands ──────────────────────────────────────────────────────

/** The section's title, at the level the page gives it (h1 for the page's main heading). */
export function SectionTitle({ ctx, id, size, className, children }: { ctx: RenderContext; id: string; size?: "xl" | "lg" | "md" | "sm"; className?: string; children: React.ReactNode }) {
  return (
    <Display as={ctx.headingLevel === 1 ? "h1" : "h2"} id={id} size={size ?? (ctx.headingLevel === 1 ? "xl" : "lg")} className={className}>
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
    <Band {...attrs} as={labelled ? "section" : "div"} surface={surface} spacing={spacing} width={width} className={cn(attrs.className as string | undefined, className)}>
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
      {eyebrow ? <p className="text-sm font-semibold uppercase tracking-wider">{eyebrow}</p> : null}
      {heading ? (
        <SectionTitle ctx={ctx} id={titleId(ctx)} size={size}>
          {heading}
        </SectionTitle>
      ) : null}
      {body ? <BandLead tone={tone}>{body}</BandLead> : null}
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
