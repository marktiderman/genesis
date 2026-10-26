import * as React from "react";
import { cn } from "../../utils";

/**
 * Props passed through to one slot's wrapper element: a class, a test id,
 * any `data-*` or ARIA attribute.
 */
export type BuilderLayoutSlotProps = React.HTMLAttributes<HTMLElement> & {
  [attribute: `data-${string}`]: string | undefined;
};

export interface BuilderLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Left column: the list of things being built (questions, lessons, steps).
   * Optional. Rendered as a `<nav>` when `outlineLabel` is set.
   */
  outline?: React.ReactNode;
  /** Centre column: the editor for the selected thing. Required. */
  editor: React.ReactNode;
  /**
   * Right column: a live preview (and anything that sits with it, such as
   * checks). Optional. Rendered as an `<aside>` when `previewLabel` is set.
   *
   * It keeps its place in the tree whatever `editor` and `outline` hold, so
   * swapping the editor (another section, another selected item) never
   * remounts it: the preview's own state (device, answers typed into it,
   * scroll) survives.
   */
  preview?: React.ReactNode;
  /** Accessible name for the outline; makes it a `navigation` landmark. */
  outlineLabel?: string | undefined;
  /** Accessible name for the preview; makes it a `complementary` landmark. */
  previewLabel?: string | undefined;
  /**
   * Keep the preview mounted but hidden, and give its width back to the
   * editor. For a section that needs the whole width (a host's own
   * settings layout) without losing the preview's state.
   */
  previewHidden?: boolean | undefined;
  /**
   * Pin the outline and/or the preview at the top while the editor scrolls,
   * once each sits in a column of its own (not while stacked). `true` pins
   * both. Default `false`.
   */
  sticky?: boolean | { outline?: boolean | undefined; preview?: boolean | undefined } | undefined;
  /**
   * With `sticky`, cap each pinned column at the viewport height and let it
   * scroll on its own, so a long outline or preview stays reachable.
   * Default `false`.
   */
  scrollSticky?: boolean | undefined;
  /** Props for the outline's wrapper (class, test id, data attributes). */
  outlineProps?: BuilderLayoutSlotProps | undefined;
  /** Props for the editor's wrapper. */
  editorProps?: BuilderLayoutSlotProps | undefined;
  /** Props for the preview's wrapper. */
  previewProps?: BuilderLayoutSlotProps | undefined;
}

type Shape = "full" | "outline" | "preview" | "editor";

/**
 * Grid tracks per slot combination. Container queries, so the columns follow
 * the space the builder has, not the window: a builder beside a sidebar gets
 * fewer columns than one on the whole screen. Written out literally because
 * Tailwind scans source text.
 *
 * Outline, editor and preview:
 *   - under 34rem everything stacks (outline, editor, preview);
 *   - from 34rem the outline (13rem) sits beside the editor, the preview under both;
 *   - from 56rem three columns: 13rem, editor, 20rem;
 *   - from 76rem the side columns widen: 16rem, editor, 24.5rem.
 * Outline and editor: 13rem from 34rem, 16rem from 48rem.
 * Editor and preview: preview 20rem from 56rem, 24.5rem from 76rem.
 */
const GRID: Record<Shape, string> = {
  full: "@min-[34rem]:grid-cols-[13rem_minmax(0,1fr)] @min-[56rem]:grid-cols-[13rem_minmax(0,1fr)_20rem] @min-[76rem]:grid-cols-[16rem_minmax(0,1fr)_24.5rem]",
  outline: "@min-[34rem]:grid-cols-[13rem_minmax(0,1fr)] @min-[48rem]:grid-cols-[16rem_minmax(0,1fr)]",
  preview: "@min-[56rem]:grid-cols-[minmax(0,1fr)_20rem] @min-[76rem]:grid-cols-[minmax(0,1fr)_24.5rem]",
  editor: "",
};

// The outline is a column from 34rem; the preview from 56rem.
const OUTLINE_STICKY = "@min-[34rem]:sticky @min-[34rem]:top-4";
const OUTLINE_SCROLL = "@min-[34rem]:max-h-[calc(100dvh-2rem)] @min-[34rem]:overflow-y-auto";
const PREVIEW_STICKY = "@min-[56rem]:sticky @min-[56rem]:top-4";
const PREVIEW_SCROLL = "@min-[56rem]:max-h-[calc(100dvh-2rem)] @min-[56rem]:overflow-y-auto";
// With an outline, the preview spans both columns while it sits under them.
const PREVIEW_UNDER = "@min-[34rem]:col-span-2 @min-[56rem]:col-span-1";

/**
 * BuilderLayout — the three columns of a builder: an outline of the parts on
 * the left, the editor for the selected part in the centre, a live preview
 * on the right.
 *
 * ```tsx
 * <BuilderLayout
 *   outline={<QuestionList />}
 *   outlineLabel="Outline"
 *   editor={<QuestionEditor key={selectedId} />}
 *   preview={<LivePreview />}
 *   previewLabel="Preview"
 *   sticky
 * />
 * ```
 *
 * Responsive by container query, so it needs no knowledge of the page around
 * it: all three columns from a 56rem container, wider side columns from
 * 76rem, the preview under the editor below 56rem and everything stacked
 * below 34rem (see `GRID` for each slot combination). The preview keeps its
 * place in the tree when the editor or outline changes, so it never
 * remounts; changing `previewLabel` between set and unset does remount it
 * (the element changes from `<div>` to `<aside>`).
 *
 * It positions the three parts and nothing else. It does **not** own tabs,
 * the app rail or a page header: those belong to the shell. Put a builder's
 * sections in `useAppShellSubNav` (or your own tabs inside `editor`) and its
 * title, status and actions in `AppShellPageHeader`. To keep one preview
 * across sections, render one `BuilderLayout` around the sections and swap
 * `editor`; nest a second one (outline and editor only) inside a section
 * that has an outline.
 *
 * @stability Beta
 */
export const BuilderLayout = React.forwardRef<HTMLDivElement, BuilderLayoutProps>(
  (
    {
      outline,
      editor,
      preview,
      outlineLabel,
      previewLabel,
      previewHidden = false,
      sticky = false,
      scrollSticky = false,
      outlineProps,
      editorProps,
      previewProps,
      className,
      ...props
    },
    ref,
  ) => {
    const hasOutline = outline != null && outline !== false;
    const hasPreview = preview != null && preview !== false;
    const showsPreview = hasPreview && !previewHidden;
    const shape: Shape = hasOutline ? (showsPreview ? "full" : "outline") : showsPreview ? "preview" : "editor";
    const stickOutline = sticky === true || (typeof sticky === "object" && !!sticky.outline);
    const stickPreview = sticky === true || (typeof sticky === "object" && !!sticky.preview);

    const Outline = outlineLabel ? "nav" : "div";
    const Preview = previewLabel ? "aside" : "div";

    return (
      <div ref={ref} data-slot="builder-layout" className={cn("@container", className)} {...props}>
        <div className={cn("grid items-start gap-6", GRID[shape])}>
          {/* Every slot keeps its position (null when absent), so the preview never moves in the tree. */}
          {hasOutline ? (
            <Outline
              aria-label={outlineLabel}
              {...outlineProps}
              data-slot="builder-layout-outline"
              className={cn(
                "min-w-0",
                stickOutline && OUTLINE_STICKY,
                stickOutline && scrollSticky && OUTLINE_SCROLL,
                outlineProps?.className,
              )}
            >
              {outline}
            </Outline>
          ) : null}
          <div {...editorProps} data-slot="builder-layout-editor" className={cn("min-w-0", editorProps?.className)}>
            {editor}
          </div>
          {hasPreview ? (
            <Preview
              aria-label={previewLabel}
              {...previewProps}
              data-slot="builder-layout-preview"
              className={cn(
                "min-w-0",
                hasOutline && PREVIEW_UNDER,
                stickPreview && PREVIEW_STICKY,
                stickPreview && scrollSticky && PREVIEW_SCROLL,
                previewHidden && "hidden",
                previewProps?.className,
              )}
            >
              {preview}
            </Preview>
          ) : null}
        </div>
      </div>
    );
  },
);
BuilderLayout.displayName = "BuilderLayout";
