/**
 * The post: where each blog post's title, date, cover and text go, on the
 * site's post page. On the post page's own path (the blog's index) there is
 * no post, and the section renders nothing.
 */
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import { RichText as RichTextView, richTextClassName, type RichTextDoc } from "@marktiderman/genesis-ui/rich-text";
import { cn } from "@marktiderman/genesis-ui/utils";
import { defineSection } from "../core/registry";
import { Line, Surface } from "../core/schemas";
import { formatPostDate } from "./blog-list";
import { SectionBand, SectionTitle, SiteImage, onAccent, titleId } from "./shared";

const schema = z.object({
  showCover: z.boolean().default(true),
  showAuthor: z.boolean().default(true),
  showDate: z.boolean().default(true),
  /** The link back to the blog's index above the title. Empty for none. */
  backLabel: Line(40).optional().default("All posts"),
  surface: Surface.default("base"),
});

export const postBodySection = defineSection({
  type: "post-body",
  version: 1,
  label: "Post",
  description: "Where each blog post goes on the post page: its title, date, author, cover and text.",
  category: "content",
  limit: 1,
  providesH1: true,
  enabledOn: ["post"],
  schema,
  variants: [
    { id: "article", label: "Article" },
    { id: "cover", label: "Title over the cover" },
  ],
  defaultVariant: "article",
  presets: [
    { name: "Article", variant: "article", props: {} },
    { name: "Title over the cover", variant: "cover", props: { surface: "base" } },
  ],
  render: ({ props, variant, node, ctx }) => {
    const post = ctx.posts?.current;
    // The blog's index (no post): nothing here, and the page's h1 goes elsewhere.
    if (!post || !ctx.posts) return null;
    const d = post.doc;
    const date = props.showDate ? formatPostDate(post.publishedAt, ctx.site.lang) : "";
    const author = props.showAuthor ? d.author?.name : undefined;
    const inverted = onAccent(props.surface);
    const back = props.backLabel ? (
      <a
        href={ctx.href(ctx.posts.path)}
        className="inline-flex min-h-11 items-center gap-2 rounded-sm text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {props.backLabel}
      </a>
    ) : null;
    const meta =
      date || author ? (
        <p className={cn("flex flex-wrap gap-x-3 text-sm", !inverted && variant !== "cover" && "text-muted-foreground")}>
          {author ? <span>By {author}</span> : null}
          {date ? <time dateTime={post.publishedAt}>{date}</time> : null}
        </p>
      ) : null;
    const title = (
      <SectionTitle ctx={ctx} id={titleId(ctx)} size="lg">
        {d.title}
      </SectionTitle>
    );
    const body = (
      <RichTextView
        value={d.body as unknown as RichTextDoc}
        headingLevels={ctx.headingLevel === 1 ? [2, 3, 4] : [3, 4]}
        className={cn(richTextClassName, "text-base sm:text-lg [&_h2]:font-display [&_h2]:text-2xl [&_h3]:font-display [&_h3]:text-xl")}
      />
    );

    if (variant === "cover" && d.cover && props.showCover) {
      return (
        <article aria-labelledby={titleId(ctx)} data-gs-section={node.type} data-gs-variant={node.variant}>
          <SectionBand node={node} ctx={ctx} surface="inverse" spacing="lg" labelled={false} className="isolate overflow-hidden">
            <SiteImage image={{ ...d.cover, decorative: true }} ctx={ctx} priority sizes="100vw" className="absolute inset-0 -z-10 h-full w-full object-cover" />
            <div aria-hidden="true" data-gs-scrim="" className="absolute inset-0 -z-10 bg-foreground/80" />
            <div className="mx-auto flex max-w-3xl flex-col gap-4">
              {back}
              {d.category ? <p data-gs-text="eyebrow" className="text-sm font-semibold uppercase tracking-wider">{d.category}</p> : null}
              {title}
              {meta}
            </div>
          </SectionBand>
          <SectionBand node={node} ctx={ctx} surface={props.surface} width="prose" labelled={false}>
            {body}
          </SectionBand>
        </article>
      );
    }
    return (
      <SectionBand node={node} ctx={ctx} surface={props.surface} width="prose" labelled={false}>
        <article aria-labelledby={titleId(ctx)} className="flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            {back}
            {d.category ? <p data-gs-text="eyebrow" className="text-sm font-semibold uppercase tracking-wider">{d.category}</p> : null}
            {title}
            {meta}
          </div>
          {props.showCover && d.cover ? <SiteImage image={d.cover} ctx={ctx} priority sizes="(min-width: 768px) 48rem, 100vw" className="aspect-[16/9] w-full rounded-xl object-cover" /> : null}
          {body}
        </article>
      </SectionBand>
    );
  },
});
