import * as React from "react";
import { cn } from "../../utils";

export interface DocumentPageProps
  // `HTMLAttributes` already declares `title?: string` (the native tooltip
  // attribute); omit it before redeclaring the page title as a ReactNode.
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** Page title. Rendered as the page's single `<h1>`. */
  title: React.ReactNode;
  /** A line under the title: an author, a date, where it sits. */
  subtitle?: React.ReactNode | undefined;
  /**
   * The page's icon above the title: an emoji, an `<img>` or an icon. Overlaps
   * the cover's bottom edge when there is a cover.
   */
  icon?: React.ReactNode;
  /**
   * A cover across the top: an image URL (drawn as a decorative, cropped
   * image) or any node (a `Band`, a gradient, your own image). Omit it and
   * the page starts at the icon or the title.
   */
  cover?: string | React.ReactNode;
  /** Controls for the whole document (Share, a menu), at the end of the title row. */
  actions?: React.ReactNode;
  /**
   * The reading column's width: `reading` (default, about 70 characters a
   * line) or `full` (the page's width, for tables and boards in the body).
   */
  width?: "reading" | "full";
  /** Stable test/automation selector (emitted as `data-testid`). */
  testID?: string | undefined;
}

/**
 * DocumentPage — a page that reads like a document: an optional cover across
 * the top, an icon, a large title and the body in a centred reading column,
 * as in a notebook app. The page template for writing (notes, a journal
 * entry, a guide, a lesson); the record page's `document` template uses it.
 *
 * ```tsx
 * <DocumentPage
 *   cover="/covers/ocean.jpg"
 *   icon="🌊"
 *   title="Trip notes"
 *   subtitle="Edited 2 days ago"
 *   actions={<Button variant="ghost" size="sm">Share</Button>}
 * >
 *   <RichText value={doc.body} />
 * </DocumentPage>
 * ```
 *
 * The cover bleeds to the page area's edges (it undoes AppShell's content
 * padding with negative margins on the sides and top), and the icon overlaps
 * its bottom edge. Everything else sits in one column, centred, so long text
 * keeps a readable line length on a wide screen. Parts: `document-page`
 * (with `data-width`), `document-page-cover`, `document-page-icon` and
 * `document-page-title`, which reads the page-title tokens like the other
 * page templates.
 *
 * This is a **layout**: it positions a cover, a header and a body and never
 * fetches the document.
 *
 * @stability Beta
 */
export const DocumentPage = React.forwardRef<HTMLDivElement, DocumentPageProps>(
  ({ className, title, subtitle, icon, cover, actions, width = "reading", testID, children, ...props }, ref) => {
    const column = width === "full" ? "w-full" : "mx-auto w-full max-w-3xl";
    const hasCover = cover != null && cover !== false;
    return (
      <div
        ref={ref}
        data-slot="document-page"
        data-width={width}
        data-testid={testID}
        className={cn("flex min-w-0 flex-col", className)}
        {...props}
      >
        {hasCover ? (
          <div
            data-slot="document-page-cover"
            className="-mx-4 -mt-4 h-40 overflow-hidden bg-muted sm:-mx-6 sm:-mt-6 sm:h-52 lg:-mx-8 lg:-mt-8 lg:h-60"
          >
            {typeof cover === "string" ? (
              <img src={cover} alt="" className="h-full w-full object-cover" />
            ) : (
              cover
            )}
          </div>
        ) : null}
        <div className={cn("flex min-w-0 flex-col gap-6", column, hasCover ? "pt-0" : "pt-4 sm:pt-8")}>
          <header className="flex min-w-0 flex-col gap-3">
            {icon != null ? (
              <div
                data-slot="document-page-icon"
                className={cn(
                  "flex h-16 w-16 items-center justify-center text-5xl leading-none [&_img]:h-full [&_img]:w-full [&_img]:object-contain [&_svg]:h-12 [&_svg]:w-12",
                  hasCover ? "-mt-8 sm:-mt-10" : undefined,
                )}
                aria-hidden={typeof icon === "string" ? true : undefined}
              >
                {icon}
              </div>
            ) : hasCover ? (
              <div className="h-6" aria-hidden />
            ) : null}
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="flex min-w-0 flex-col gap-1">
                <h1
                  data-slot="document-page-title"
                  className="break-words text-3xl font-[number:var(--page-title-font-weight)] tracking-[var(--page-title-letter-spacing)] [text-transform:var(--page-title-text-transform)] sm:text-4xl"
                >
                  {title}
                </h1>
                {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
              </div>
              {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
            </div>
          </header>
          <div data-slot="document-page-body" className="min-w-0 text-base leading-7">
            {children}
          </div>
        </div>
      </div>
    );
  },
);
DocumentPage.displayName = "DocumentPage";
