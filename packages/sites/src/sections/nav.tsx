import { z } from "zod";
import { Band } from "@marktiderman/genesis-ui/band";
import { cn } from "@marktiderman/genesis-ui/utils";
import { Menu } from "lucide-react";
import { defineSection, type RenderContext } from "../core/registry";
import { Image, Link, type MenuItem } from "../core/schemas";
import { ButtonLink, SiteImage, bandAttrs, resolveHref } from "./shared";

const schema = z.object({
  /** Replaces the brand's logo in the header. */
  logo: Image.optional(),
  /** Show the site's name beside the logo (always shown when there is no logo). */
  showName: z.boolean().default(true),
  cta: Link.optional(),
});
type NavProps = z.output<typeof schema>;

function isCurrent(item: MenuItem, ctx: RenderContext): boolean {
  return item.href === ctx.pagePath;
}

function Brand({ props, ctx }: { props: NavProps; ctx: RenderContext }) {
  const logo = props.logo ?? (ctx.site.logo ? { src: ctx.site.logo.src, alt: ctx.site.logo.alt, decorative: false } : undefined);
  const showName = props.showName || !logo;
  return (
    <a
      href={ctx.href("/")}
      className="inline-flex min-h-11 items-center gap-3 rounded-md font-display text-lg font-bold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {logo ? <SiteImage image={{ ...logo, alt: showName ? "" : logo.alt || ctx.site.name, decorative: showName }} ctx={ctx} eager sizes="240px" className="h-8 w-auto" /> : null}
      {showName ? <span>{ctx.site.name}</span> : null}
      <span className="sr-only">, home</span>
    </a>
  );
}

function Items({ ctx, className, itemClassName }: { ctx: RenderContext; className?: string; itemClassName?: string }) {
  return (
    <ul className={className}>
      {ctx.site.nav.map((item) => (
        <li key={`${item.label}-${item.href}`}>
          <a
            href={resolveHref(item.href, ctx)}
            {...(isCurrent(item, ctx) ? { "aria-current": "page" as const } : {})}
            className={cn(
              "inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-[current=page]:underline aria-[current=page]:underline-offset-8",
              itemClassName,
            )}
          >
            {item.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

function NavSection({ props, variant, node, ctx }: { props: NavProps; variant: string; node: Parameters<typeof bandAttrs>[0]; ctx: RenderContext }) {
  const attrs = bandAttrs(node, ctx, undefined, false);
  const hasMenu = variant !== "minimal" && ctx.site.nav.length > 0;
  const centered = variant === "centered";
  return (
    <Band {...attrs} as="header" spacing="none" className={cn("border-b border-border", attrs.className as string | undefined)}>
      <div className={cn("relative flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2", centered && "md:flex-col md:justify-center md:py-4")}>
        <Brand props={props} ctx={ctx} />
        {hasMenu ? (
          <nav aria-label="Main" className={cn("flex items-center gap-2", centered && "md:w-full md:justify-center")}>
            <Items ctx={ctx} className="hidden items-center gap-1 md:flex" />
            {props.cta ? <ButtonLink link={props.cta} ctx={ctx} className="hidden md:inline-flex" /> : null}
            {/* Phones: a disclosure that works without script; the islands script closes it on Escape and on a link. */}
            <details className="group md:hidden" data-gs-island="menu">
              <summary className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-md border border-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                <Menu aria-hidden="true" className="size-5" />
                <span className="sr-only">Menu</span>
              </summary>
              <div className="absolute inset-x-0 top-full z-50 border-b border-border bg-background px-4 pb-4 shadow-lg">
                <Items ctx={ctx} className="flex flex-col py-2" itemClassName="w-full" />
                {props.cta ? <ButtonLink link={props.cta} ctx={ctx} className="w-full" /> : null}
              </div>
            </details>
          </nav>
        ) : props.cta ? (
          <ButtonLink link={props.cta} ctx={ctx} />
        ) : null}
      </div>
    </Band>
  );
}

export const navSection = defineSection({
  type: "nav",
  version: 1,
  label: "Navigation",
  description: "The site's header: logo, menu and a button. On phones the menu folds into a button.",
  category: "header",
  placement: "header",
  limit: 1,
  schema,
  variants: [
    { id: "simple", label: "Logo left, menu right" },
    { id: "centered", label: "Logo centred, menu below" },
    { id: "minimal", label: "Logo and button only" },
  ],
  defaultVariant: "simple",
  presets: [
    { name: "Header with menu", variant: "simple", props: { showName: true, cta: { label: "Get started", href: "#contact" } } },
    { name: "Centred header", variant: "centered", props: { showName: true } },
    { name: "Landing page header", variant: "minimal", props: { showName: true, cta: { label: "Get started", href: "#contact" } } },
  ],
  render: (input) => <NavSection {...input} />,
});
