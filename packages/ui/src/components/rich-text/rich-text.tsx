/**
 * RichText — read-only rendering of a rich text document (the JSON that
 * `RichTextEditor` produces), plus the server-safe helpers for that JSON.
 *
 * This subpath has no editor dependency and no `"use client"`: it renders in
 * a React Server Component, during SSR, or on the client, and a server can
 * import the helpers on their own to sanitize posted JSON and derive HTML.
 *
 * @stability Beta
 */
import * as React from "react";
import { cn } from "../../utils";
import {
  type RichTextDoc,
  type RichTextHeadingLevel,
  type RichTextNode,
  type VideoEmbedAttrs,
  VIDEO_IFRAME_ATTRS,
  isExternalHref,
  orderedMarks,
  sanitizeRichTextDoc,
  videoEmbedSrc,
  videoEmbedTitle,
  videoWatchUrl,
} from "./rich-text-doc";

// The public, server-safe surface. `orderedMarks` and `isExternalHref` stay
// internal: they are rendering details, not API.
export {
  emptyRichTextDoc,
  escapeHtml,
  isRichTextDoc,
  isRichTextEmpty,
  isSafeUrl,
  normalizeLinkUrl,
  parseVideoUrl,
  RichTextLimitError,
  richTextToHtml,
  richTextToPlainText,
  sanitizeRichTextDoc,
  sanitizeVideoEmbedAttrs,
  videoEmbedSrc,
  videoEmbedTitle,
  videoWatchUrl,
  VIDEO_IFRAME_ATTRS,
} from "./rich-text-doc";
export type {
  RichTextDoc,
  RichTextHeadingLevel,
  RichTextMark,
  RichTextNode,
  RichTextToHtmlOptions,
  SanitizeRichTextOptions,
  VideoEmbedAttrs,
  VideoProvider,
} from "./rich-text-doc";

/**
 * Typography for rendered rich text, shared by `RichText` and the editor's
 * editable area so a document looks the same while writing and reading.
 * Exported for apps that render stored HTML themselves.
 */
export const richTextClassName = cn(
  "text-sm leading-relaxed text-foreground break-words",
  "[&>*+*]:mt-3",
  "[&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:mt-6 first:[&_h2]:mt-0",
  "[&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-5 first:[&_h3]:mt-0",
  "[&_h4]:text-base [&_h4]:font-semibold [&_h4]:mt-4 first:[&_h4]:mt-0",
  "[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6 [&_li]:my-1 [&_li>p]:m-0",
  "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_blockquote]:italic",
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4",
  "[&_[data-video-embed]]:relative [&_[data-video-embed]]:aspect-video [&_[data-video-embed]]:w-full [&_[data-video-embed]]:overflow-hidden [&_[data-video-embed]]:rounded-md [&_[data-video-embed]]:bg-muted",
  "[&_[data-video-embed]_iframe]:absolute [&_[data-video-embed]_iframe]:inset-0 [&_[data-video-embed]_iframe]:h-full [&_[data-video-embed]_iframe]:w-full [&_[data-video-embed]_iframe]:border-0",
);

export interface RichTextProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  /**
   * The document to render (the editor's JSON). Untrusted input is fine: it
   * is sanitized before rendering, and nothing is set as raw HTML.
   * `null`/`undefined` render an empty container.
   */
  value: RichTextDoc | null | undefined;
  /** Render video embeds as players (`true`, default) or as plain links. */
  embeds?: boolean;
  /** Heading levels to keep; others move to the nearest kept level. Default `[2, 3, 4]`. */
  headingLevels?: readonly RichTextHeadingLevel[];
  /** Stable test/automation selector (emitted as `data-testid`). */
  testID?: string;
}

function renderInline(nodes: RichTextNode[] | undefined): React.ReactNode[] {
  if (!nodes) return [];
  return nodes.map((node, i) => {
    if (node.type === "hardBreak") return <br key={i} />;
    let el: React.ReactNode = node.text ?? "";
    const marks = orderedMarks(node.marks);
    for (let m = marks.length - 1; m >= 0; m--) {
      const mark = marks[m]!;
      if (mark.type === "bold") el = <strong>{el}</strong>;
      else if (mark.type === "italic") el = <em>{el}</em>;
      else if (mark.type === "underline") el = <u>{el}</u>;
      else if (mark.type === "link") {
        const href = String(mark.attrs?.href);
        el = isExternalHref(href) ? (
          <a href={href} target="_blank" rel="noopener noreferrer nofollow">
            {el}
          </a>
        ) : (
          <a href={href}>{el}</a>
        );
      }
    }
    return <React.Fragment key={i}>{el}</React.Fragment>;
  });
}

function VideoEmbedView({ attrs, asLink }: { attrs: VideoEmbedAttrs; asLink: boolean }) {
  const title = videoEmbedTitle(attrs);
  if (asLink) {
    return (
      <p>
        <a href={videoWatchUrl(attrs)} target="_blank" rel="noopener noreferrer nofollow">
          {title}
        </a>
      </p>
    );
  }
  return (
    <div data-video-embed="" data-provider={attrs.provider}>
      <iframe
        src={videoEmbedSrc(attrs)}
        title={title}
        allow={VIDEO_IFRAME_ATTRS.allow}
        allowFullScreen
        loading={VIDEO_IFRAME_ATTRS.loading}
        referrerPolicy={VIDEO_IFRAME_ATTRS.referrerPolicy}
        sandbox={VIDEO_IFRAME_ATTRS.sandbox}
      />
    </div>
  );
}

function renderBlocks(nodes: RichTextNode[] | undefined, asLink: boolean): React.ReactNode[] {
  if (!nodes) return [];
  return nodes.map((node, i) => {
    switch (node.type) {
      case "paragraph":
        return <p key={i}>{renderInline(node.content)}</p>;
      case "heading": {
        const Tag = `h${node.attrs?.level as RichTextHeadingLevel}` as "h2" | "h3" | "h4";
        return <Tag key={i}>{renderInline(node.content)}</Tag>;
      }
      case "bulletList":
        return <ul key={i}>{renderBlocks(node.content, asLink)}</ul>;
      case "orderedList":
        return (
          <ol key={i} start={node.attrs?.start as number | undefined}>
            {renderBlocks(node.content, asLink)}
          </ol>
        );
      case "listItem":
        return <li key={i}>{renderBlocks(node.content, asLink)}</li>;
      case "blockquote":
        return <blockquote key={i}>{renderBlocks(node.content, asLink)}</blockquote>;
      case "videoEmbed":
        return (
          <VideoEmbedView key={i} attrs={node.attrs as unknown as VideoEmbedAttrs} asLink={asLink} />
        );
      default:
        return null;
    }
  });
}

/**
 * RichText — renders a rich text document as React elements.
 *
 * The document is passed through `sanitizeRichTextDoc` first, and rendering
 * never uses `dangerouslySetInnerHTML`: text is React-escaped, links keep
 * only http(s)/mailto/tel/relative URLs, and the only iframes are YouTube,
 * Vimeo and Loom players rebuilt from a validated id. That makes it safe for
 * stored or user-supplied JSON.
 *
 * Server-component safe (no hooks, no `"use client"`).
 *
 * @stability Beta
 */
export function RichText({
  value,
  embeds = true,
  headingLevels,
  className,
  testID,
  ...props
}: RichTextProps) {
  // No hooks on purpose, so this stays usable as a React Server Component.
  const doc = value ? sanitizeRichTextDoc(value, headingLevels ? { headingLevels } : {}) : null;
  return (
    <div data-testid={testID} className={cn(richTextClassName, className)} {...props}>
      {doc ? renderBlocks(doc.content, !embeds) : null}
    </div>
  );
}
