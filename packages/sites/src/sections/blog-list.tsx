/**
 * The blog's posts: the newest first, as a list or a grid of cards, with
 * pages of `perPage` (`?page=2`, plain links, no script). On the post page's
 * own path it is the blog's index; anywhere else it is "the latest posts".
 * On a post it leaves that post out ("More posts").
 *
 * Posts come from the store (`listLivePosts`), read by the renderer once per
 * page. A site needs its post page (kind `post`) for the links to open.
 */
import { z } from "zod";
import { cn } from "@marktiderman/genesis-ui/utils";
import { postPath } from "../core/seo";
import { defineSection, type RenderContext } from "../core/registry";
import type { PostSummary } from "../core/posts";
import { Copy, Line, Link, Surface } from "../core/schemas";
import { Anchor, ButtonLink, ItemTitle, SectionBand, SectionIntro, SiteImage, onAccent } from "./shared";

const schema = z.object({
  eyebrow: Line(60).optional(),
  heading: Line(90),
  body: Copy(320).optional(),
  /** Posts per page. */
  perPage: z.number().int().min(1).max(24).default(6),
  /** Pages of posts (`?page=2`); off shows only the newest `perPage`. */
  paginate: z.boolean().default(true),
  /** Only posts in this category. */
  category: Line(60).optional(),
  showExcerpt: z.boolean().default(true),
  showDate: z.boolean().default(true),
  emptyText: Line(120).default("No posts yet. Check back soon."),
  /** A button under the list ("All posts"). */
  cta: Link.optional(),
  surface: Surface.default("base"),
  anchor: Anchor,
});

/** A post's date as the page says it, in UTC so every visitor sees the same day. */
export function formatPostDate(iso: string, lang: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeZone: "UTC" }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** The page of the list a link goes to: the page itself for page 1, `?page=n` after it. */
function pageHref(ctx: RenderContext, page: number): string {
  return ctx.href(page <= 1 ? ctx.pagePath : `${ctx.pagePath}?page=${page}`);
}

function PostMeta({ post, ctx, showDate, muted }: { post: PostSummary; ctx: RenderContext; showDate: boolean; muted: boolean }) {
  const date = showDate ? formatPostDate(post.publishedAt, ctx.site.lang) : "";
  if (!date && !post.category) return null;
  return (
    <p className={cn("flex flex-wrap gap-x-3 text-sm", muted && "text-muted-foreground")}>
      {post.category ? <span className="font-semibold uppercase tracking-wide">{post.category}</span> : null}
      {date ? <time dateTime={post.publishedAt}>{date}</time> : null}
    </p>
  );
}

export const blogListSection = defineSection({
  type: "blog-list",
  version: 1,
  label: "Blog posts",
  description: "The blog's posts, newest first, as a list or cards, with pages. Needs the site's post page.",
  category: "content",
  schema,
  variants: [
    { id: "grid", label: "Cards with covers" },
    { id: "list", label: "List" },
  ],
  defaultVariant: "grid",
  presets: [
    { name: "Blog index", variant: "grid", props: { heading: "Latest posts", perPage: 9 } },
    { name: "Latest three", variant: "list", props: { heading: "From the blog", perPage: 3, paginate: false, cta: { label: "All posts", href: "/blog" } } },
  ],
  render: ({ props, variant, node, ctx }) => {
    const inverted = onAccent(props.surface);
    const intro = <SectionIntro ctx={ctx} eyebrow={props.eyebrow} heading={props.heading} body={props.body} tone={inverted ? "inherit" : "muted"} />;
    const blog = ctx.posts;
    if (!blog) {
      console.error(`[genesis-sites] ${ctx.pagePath}: the post list has no posts to show (the site has no post page, or the store can't list posts).`);
      return ctx.mode === "preview" ? (
        <SectionBand node={node} ctx={ctx} anchor={props.anchor} surface={props.surface}>
          {intro}
          <p role="status" className="mt-8 rounded-lg border border-dashed border-border p-6 text-center">
            The post list needs the site's post page (a page of kind “post”, such as /blog).
          </p>
        </SectionBand>
      ) : null;
    }
    const all = blog.list.filter((p) => p.slug !== blog.current?.slug && (!props.category || p.category === props.category));
    const pages = props.paginate ? Math.max(1, Math.ceil(all.length / props.perPage)) : 1;
    const page = props.paginate && !blog.current ? Math.min(Math.max(1, blog.page), pages) : 1;
    const shown = all.slice((page - 1) * props.perPage, page * props.perPage);
    const href = (p: PostSummary) => ctx.href(postPath(blog.path, p.slug));
    const grid = variant === "grid";

    return (
      <SectionBand node={node} ctx={ctx} anchor={props.anchor} surface={props.surface}>
        {intro}
        {shown.length ? (
          <ul className={cn("mt-10", grid ? "grid gap-6 sm:grid-cols-2 lg:grid-cols-3" : "mx-auto flex max-w-3xl flex-col divide-y divide-border")}>
            {shown.map((post) => (
              <li key={post.slug} className={grid ? "flex" : "py-6 first:pt-0"}>
                <article className={cn("flex w-full flex-col gap-3", grid && "rounded-xl border border-border bg-background text-foreground")}>
                  {grid ? (
                    post.cover ? (
                      // The title says what the post is; its cover is decoration here.
                      <SiteImage image={{ ...post.cover, decorative: true }} ctx={ctx} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="aspect-[16/10] w-full rounded-t-xl object-cover" />
                    ) : (
                      <div aria-hidden="true" className="aspect-[16/10] w-full rounded-t-xl bg-muted" />
                    )
                  ) : null}
                  <div className={cn("flex flex-1 flex-col gap-2", grid && "p-5 pt-2")}>
                    <PostMeta post={post} ctx={ctx} showDate={props.showDate} muted={grid || !inverted} />
                    <ItemTitle ctx={ctx} className="text-xl">
                      <a href={href(post)} className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                        {post.title}
                      </a>
                    </ItemTitle>
                    {props.showExcerpt && post.excerpt ? <p className={cn(grid || !inverted ? "text-muted-foreground" : undefined)}>{post.excerpt}</p> : null}
                  </div>
                </article>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-10 text-center">{props.emptyText}</p>
        )}
        {props.paginate && pages > 1 && !blog.current ? (
          <nav aria-label={`${props.heading}: pages`} className="mt-10 flex items-center justify-between gap-4">
            {page > 1 ? (
              <a href={pageHref(ctx, page - 1)} rel="prev" className="inline-flex min-h-11 items-center rounded-md px-2 font-medium underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                Newer posts
              </a>
            ) : (
              <span />
            )}
            <p className="text-sm">
              Page {page} of {pages}
            </p>
            {page < pages ? (
              <a href={pageHref(ctx, page + 1)} rel="next" className="inline-flex min-h-11 items-center rounded-md px-2 font-medium underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                Older posts
              </a>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
        {props.cta ? (
          <div className="mt-10 flex justify-center">
            <ButtonLink link={props.cta} ctx={ctx} tone={inverted ? "inverse" : "outline"} />
          </div>
        ) : null}
      </SectionBand>
    );
  },
});
