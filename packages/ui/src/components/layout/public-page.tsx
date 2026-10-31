import * as React from "react";
import { renderSlot, type SlotPropsFor, type Slots } from "@marktiderman/genesis-core/slots";
import { cn } from "../../utils";
import { Container, type ContainerProps } from "./container";
import { brandThemeStyle, type PublicBrand } from "./brand-theme";

/** The parts of a {@link PublicPage} that `slots` and `slotProps` reach. */
export type PublicPageSlotMap = {
  header: { brand: PublicBrand; testID: string };
  footer: { children: React.ReactNode; poweredBy?: React.ReactNode; testID: string };
};

export interface PublicPageProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /**
   * The brand the page belongs to. Its header (logo, name, cover image) shows
   * at the top, and its `accent` themes the page: see `brandThemeStyle`.
   */
  brand?: PublicBrand;
  /** Optional page heading, rendered as the page's `<h1>` above the content. Leave it out when the content brings its own (a form's title). */
  title?: React.ReactNode | undefined;
  /** Supporting copy under `title`. */
  description?: React.ReactNode | undefined;
  /** Width of the content column: a `Container` size. Default `"sm"`. */
  maxWidth?: NonNullable<ContainerProps["size"]>;
  /**
   * Who runs the page, as "Powered by …" in the footer (a name or a link).
   * Leave it out, or pass `false`, to hide it.
   */
  poweredBy?: React.ReactNode;
  /** More footer content: privacy and terms links, an address. */
  footer?: React.ReactNode;
  /**
   * For an iframe: no header or footer chrome, a transparent background and
   * no full-viewport height, so the frame is as tall as its content. The
   * brand accent still applies. A host usually sets it from `?embed=1`.
   */
  embedded?: boolean;
  /** Replace (a component) or drop (`null`) the header or footer. */
  slots?: Slots<PublicPageSlotMap>;
  /** More props for a default part, merged over what the page passes. */
  slotProps?: SlotPropsFor<PublicPageSlotMap>;
  /** testID on the root. Default `"public-page"`; parts use `${testID}-header`, `-main`, `-footer`. */
  testID?: string | undefined;
}

/**
 * PublicPage — a page anyone can open without signing in: a public form, a
 * QR poster, a landing page. A brand header, one content column, and a
 * "Powered by …" footer, themed from a brand object.
 *
 * ```tsx
 * <PublicPage
 *   brand={{ name: "Riverside Physio", logoUrl, accent: "#10b981" }}
 *   poweredBy={<a href="https://example.com">Example</a>}
 *   embedded={searchParams.get("embed") === "1"}
 * >
 *   <Form … />
 * </PublicPage>
 * ```
 *
 * The brand's accent becomes `--primary` (darkened when it fails 4.5:1 on
 * white) on the page root, so a `Button` or link inside follows the brand
 * with no props. The check is against white, Genesis's light background;
 * under a `.dark` theme the fill stays readable (white on the shade) but
 * accent-coloured text may not, so public pages are best served light.
 *
 * `embedded` is the frame-ancestors case. It drops the header and footer,
 * the background and `min-height: 100dvh` (inside an iframe the viewport is
 * the frame, so a full-height page would never let the frame shrink to its
 * content).
 *
 * This is a **layout**: it positions content and binds to nothing. The
 * content column is a `Container` for the one-home reason.
 *
 * @stability Beta
 */
export const PublicPage = React.forwardRef<HTMLDivElement, PublicPageProps>(
  (
    {
      brand,
      title,
      description,
      maxWidth = "sm",
      poweredBy,
      footer,
      embedded = false,
      slots = {},
      slotProps = {},
      testID = "public-page",
      className,
      style,
      children,
      ...props
    },
    ref,
  ) => {
    const showPoweredBy = poweredBy !== undefined && poweredBy !== null && poweredBy !== false;
    const hasFooter = showPoweredBy || (footer !== undefined && footer !== null && footer !== false);
    return (
      <div
        ref={ref}
        data-slot="public-page"
        data-embedded={embedded ? "true" : undefined}
        data-testid={testID}
        className={cn(
          "flex w-full min-w-0 flex-col text-foreground",
          embedded ? "bg-transparent" : "min-h-dvh bg-background",
          className,
        )}
        style={{ ...brandThemeStyle(brand), ...style }}
        {...props}
      >
        {!embedded && brand
          ? renderSlot(DefaultHeader, slots.header, { brand, testID: `${testID}-header` }, slotProps.header)
          : null}
        <main
          data-slot="public-page-main"
          data-testid={`${testID}-main`}
          className={cn("flex min-w-0 flex-1 flex-col", embedded ? "py-4" : "py-8 sm:py-12")}
        >
          <Container size={maxWidth} className="flex min-w-0 flex-col gap-6">
            {title ? (
              <div data-slot="public-page-heading" className="flex min-w-0 flex-col gap-1">
                <h1 className="text-2xl font-bold tracking-tight break-words sm:text-3xl">{title}</h1>
                {description ? <p className="text-muted-foreground">{description}</p> : null}
              </div>
            ) : null}
            {children}
          </Container>
        </main>
        {!embedded && hasFooter
          ? renderSlot(
              DefaultFooter,
              slots.footer,
              { children: footer, poweredBy: showPoweredBy ? poweredBy : undefined, testID: `${testID}-footer` },
              slotProps.footer,
            )
          : null}
      </div>
    );
  },
);
PublicPage.displayName = "PublicPage";

function DefaultHeader({ brand, testID }: PublicPageSlotMap["header"]) {
  return (
    <header
      data-slot="public-page-header"
      data-testid={testID}
      className="border-b border-border border-t-4 border-t-[hsl(var(--brand-accent,var(--primary)))] bg-background"
    >
      {brand.headerImageUrl ? (
        <img
          src={brand.headerImageUrl}
          alt=""
          data-slot="public-page-cover"
          className="block h-28 w-full object-cover sm:h-44"
        />
      ) : null}
      <Container size="lg" className="flex min-h-14 items-center gap-3 py-3">
        {brand.logoUrl ? (
          // The name is beside it, so the image is decorative: an alt of the
          // name would read it twice.
          <img src={brand.logoUrl} alt="" data-slot="public-page-logo" className="h-8 w-auto max-w-32 shrink-0 object-contain" />
        ) : null}
        <span data-slot="public-page-brand-name" className="min-w-0 truncate font-semibold">
          {brand.name}
        </span>
      </Container>
    </header>
  );
}

function DefaultFooter({ children, poweredBy, testID }: PublicPageSlotMap["footer"]) {
  return (
    <footer data-slot="public-page-footer" data-testid={testID} className="border-t border-border">
      <Container
        size="lg"
        className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground sm:flex-row sm:justify-between sm:text-left"
      >
        {children ? <div className="min-w-0">{children}</div> : null}
        {poweredBy ? (
          <p data-slot="public-page-powered-by" className="sm:ml-auto">
            Powered by {poweredBy}
          </p>
        ) : null}
      </Container>
    </footer>
  );
}
