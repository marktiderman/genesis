/**
 * Rich text documents: the JSON shape, the allow-list that sanitizes it, and
 * the serializers (HTML, plain text) built on that allow-list.
 *
 * This file has no React and no editor dependency, so a server can import it
 * (through `@marktiderman/genesis-ui/rich-text`) to validate what a client
 * posted and to produce the HTML it stores or sends. Everything here works in
 * Node, edge runtimes and browsers alike: no DOM, no `DOMParser`.
 *
 * WHY JSON IS CANONICAL. The editor's document is a tree (ProseMirror). JSON
 * is that tree written down; HTML is one rendering of it. Storing JSON keeps
 * the structure the editor understands, so a later schema change is a data
 * migration instead of an HTML scraping job. HTML is derived: produce it from
 * the JSON with `richTextToHtml`, on the server, after `sanitizeRichTextDoc`.
 *
 * WHY AN ALLOW-LIST. Anything not named below is dropped: unknown node and
 * mark types, unknown attributes, links whose URL is not http(s), mailto, tel
 * or relative, and embeds whose URL is not a recognised YouTube, Vimeo or Loom
 * video. The serializers only ever emit tags this file writes itself, and
 * every text and attribute value goes through `escapeHtml`, so the output
 * cannot carry a `<script>`, an event handler or a `javascript:` URL no matter
 * what JSON came in.
 */

/** A mark on a text node. `link` carries its URL in `attrs.href`. */
export interface RichTextMark {
  type: string;
  attrs?: Record<string, unknown>;
}

/**
 * One node of a rich text document. Structurally the same as Tiptap's
 * `JSONContent`, so editor output can be passed straight in.
 */
export interface RichTextNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichTextNode[];
  marks?: RichTextMark[];
  text?: string;
}

/** The root node of a rich text document. */
export interface RichTextDoc extends RichTextNode {
  type: "doc";
  content: RichTextNode[];
}

/** Heading levels a document may contain. `h1` is left to the page title. */
export type RichTextHeadingLevel = 2 | 3 | 4;

/** Video hosts the `videoEmbed` node accepts. */
export type VideoProvider = "youtube" | "vimeo" | "loom";

/** A video reference, reduced to what is needed to rebuild its player URL. */
export interface VideoEmbedAttrs {
  provider: VideoProvider;
  /** The host's video id (YouTube 11 chars, Vimeo digits, Loom alphanumeric). */
  id: string;
  /** Vimeo's privacy hash for unlisted videos (`vimeo.com/123/abcdef`). */
  hash?: string;
  /** Accessible name for the player frame. */
  title?: string;
}

export interface SanitizeRichTextOptions {
  /** Heading levels to keep. Others move to the nearest kept level. Default `[2, 3, 4]`. */
  headingLevels?: readonly RichTextHeadingLevel[];
  /** Keep `videoEmbed` nodes. Default `true`. When false they are dropped. */
  embeds?: boolean;
  /**
   * Reject documents whose text is longer than this (characters, counted
   * after sanitizing). Throws `RichTextLimitError`. Off by default; set it on
   * the server for every write that accepts rich text from a client.
   */
  maxCharacters?: number;
  /**
   * Reject documents with more nodes than this (every node except the root,
   * text included, counted after sanitizing). Throws `RichTextLimitError`.
   * Off by default; set it on the server alongside `maxCharacters`.
   */
  maxNodes?: number;
  /**
   * What to do with content nested deeper than 32 levels. `"drop"` (default)
   * leaves it out, which suits rendering stored documents; `"throw"` rejects
   * the whole document with `RichTextLimitError`, which suits server writes,
   * so nothing an author wrote disappears without them being told.
   */
  onTooDeep?: "drop" | "throw";
}

/** Thrown by `sanitizeRichTextDoc` when a document breaks a limit it was given. */
export class RichTextLimitError extends Error {
  readonly reason: "characters" | "nodes" | "depth";
  readonly limit: number;
  /** The measured size; for `"depth"`, the limit plus one. */
  readonly actual: number;
  constructor(reason: "characters" | "nodes" | "depth", limit: number, actual: number) {
    super(
      reason === "depth"
        ? `Rich text is nested more than ${limit} levels deep`
        : `Rich text has ${actual} ${reason}; the limit is ${limit}`,
    );
    this.name = "RichTextLimitError";
    this.reason = reason;
    this.limit = limit;
    this.actual = actual;
  }
}

export interface RichTextToHtmlOptions extends SanitizeRichTextOptions {
  /**
   * How video embeds are written. `"iframe"` (default) emits a player frame
   * pointing at the host's embed URL; `"link"` emits a plain link to the
   * video, for email and other places iframes do not run.
   */
  embedAs?: "iframe" | "link";
}

const MAX_DEPTH = 32;
const MAX_TITLE_LENGTH = 200;

/** An empty document: one empty paragraph, which is what the editor produces. */
export function emptyRichTextDoc(): RichTextDoc {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

/**
 * True when `url` is safe to put in an `href`: an absolute http(s), mailto or
 * tel URL, a root-relative path (`/lessons/1`) or a fragment (`#notes`).
 *
 * Rejects `javascript:`, `data:`, `vbscript:` and every other scheme, as well
 * as protocol-relative `//host` URLs and anything containing whitespace or
 * control characters (browsers strip those, which is how `java\tscript:`
 * slips past naive checks).
 */
export function isSafeUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  const value = url.trim();
  if (value === "" || value.length > 2048) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000- \u007f-\u009f]/.test(value)) return false;
  if (value.startsWith("#")) return true;
  if (value.startsWith("/")) return !value.startsWith("//") && !value.startsWith("/\\");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return SAFE_PROTOCOLS.has(parsed.protocol);
}

/**
 * Turn what a person typed into the link field into a safe href, or `null`.
 * `example.com/page` becomes `https://example.com/page`; an email address
 * becomes a `mailto:` link.
 */
export function normalizeLinkUrl(input: string): string | null {
  const value = input.trim();
  if (value === "") return null;
  if (isSafeUrl(value)) return value;
  if (/^[^\s@/:]+@[^\s@/]+\.[^\s@/]+$/.test(value)) {
    const mail = `mailto:${value}`;
    return isSafeUrl(mail) ? mail : null;
  }
  // No scheme but looks like a host: assume https.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value) && /^[^\s/]+\.[^\s/]+/.test(value)) {
    const withScheme = `https://${value}`;
    return isSafeUrl(withScheme) ? withScheme : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Video embeds
// ---------------------------------------------------------------------------

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{1,12}$/;
const VIMEO_HASH = /^[a-f0-9]{6,32}$/;
const LOOM_ID = /^[A-Za-z0-9]{8,64}$/;

function hostOf(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
}

/**
 * Recognise a YouTube, Vimeo or Loom video URL (watch, share, short and embed
 * forms) and reduce it to its provider and id. Returns `null` for anything
 * else, including other hosts that merely look similar.
 */
export function parseVideoUrl(input: string): VideoEmbedAttrs | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = hostOf(url);
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "youtube.com" || host === "youtube-nocookie.com" || host === "music.youtube.com") {
    let id: string | null | undefined = null;
    if (parts[0] === "watch") id = url.searchParams.get("v");
    else if (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live" || parts[0] === "v")
      id = parts[1];
    return id && YOUTUBE_ID.test(id) ? { provider: "youtube", id } : null;
  }
  if (host === "youtu.be") {
    const id = parts[0];
    return id && YOUTUBE_ID.test(id) ? { provider: "youtube", id } : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    // vimeo.com/123, vimeo.com/123/abcdef, vimeo.com/channels/x/123,
    // player.vimeo.com/video/123?h=abcdef
    // vimeo.com/showcase/1/video/2 and album/…/video/2: the video follows "video".
    const videoAt = parts.lastIndexOf("video");
    const idIndex =
      videoAt !== -1 && parts[videoAt + 1] && VIMEO_ID.test(parts[videoAt + 1]!)
        ? videoAt + 1
        : parts.findIndex((p) => VIMEO_ID.test(p));
    if (idIndex === -1) return null;
    const id = parts[idIndex]!;
    // A privacy hash is the path segment right after the id only in the short
    // `vimeo.com/<id>/<hash>` form; otherwise it is the `h` query parameter.
    const hash = url.searchParams.get("h") ?? (host === "vimeo.com" && idIndex === 0 ? parts[1] : undefined);
    return hash && VIMEO_HASH.test(hash)
      ? { provider: "vimeo", id, hash }
      : { provider: "vimeo", id };
  }
  if (host === "loom.com") {
    if (parts[0] !== "share" && parts[0] !== "embed") return null;
    const id = parts[1];
    return id && LOOM_ID.test(id) ? { provider: "loom", id } : null;
  }
  return null;
}

/** Validate untrusted embed attributes, returning a clean copy or `null`. */
export function sanitizeVideoEmbedAttrs(attrs: unknown): VideoEmbedAttrs | null {
  if (!attrs || typeof attrs !== "object") return null;
  const a = attrs as Record<string, unknown>;
  const id = typeof a.id === "string" ? a.id : "";
  let clean: VideoEmbedAttrs | null = null;
  if (a.provider === "youtube" && YOUTUBE_ID.test(id)) clean = { provider: "youtube", id };
  else if (a.provider === "vimeo" && VIMEO_ID.test(id)) {
    clean = { provider: "vimeo", id };
    if (typeof a.hash === "string" && VIMEO_HASH.test(a.hash)) clean.hash = a.hash;
  } else if (a.provider === "loom" && LOOM_ID.test(id)) clean = { provider: "loom", id };
  if (!clean) return null;
  if (typeof a.title === "string" && a.title.trim() !== "") {
    clean.title = a.title.trim().slice(0, MAX_TITLE_LENGTH);
  }
  return clean;
}

const PROVIDER_NAMES: Record<VideoProvider, string> = {
  youtube: "YouTube",
  vimeo: "Vimeo",
  loom: "Loom",
};

/** The player URL for an embed. Built from validated parts only. */
export function videoEmbedSrc(attrs: VideoEmbedAttrs): string {
  switch (attrs.provider) {
    case "youtube":
      // The privacy-enhanced host: no tracking cookies until the viewer plays.
      return `https://www.youtube-nocookie.com/embed/${attrs.id}`;
    case "vimeo":
      return `https://player.vimeo.com/video/${attrs.id}${attrs.hash ? `?h=${attrs.hash}` : ""}`;
    case "loom":
      return `https://www.loom.com/embed/${attrs.id}`;
  }
}

/** The page URL for an embed (what a viewer would open in a new tab). */
export function videoWatchUrl(attrs: VideoEmbedAttrs): string {
  switch (attrs.provider) {
    case "youtube":
      return `https://www.youtube.com/watch?v=${attrs.id}`;
    case "vimeo":
      return `https://vimeo.com/${attrs.id}${attrs.hash ? `/${attrs.hash}` : ""}`;
    case "loom":
      return `https://www.loom.com/share/${attrs.id}`;
  }
}

/** Accessible name for an embed's frame: its title, or "YouTube video" etc. */
export function videoEmbedTitle(attrs: VideoEmbedAttrs): string {
  return attrs.title || `${PROVIDER_NAMES[attrs.provider]} video`;
}

/**
 * Attributes for an embed's `<iframe>`. Shared by the HTML serializer, the
 * React renderer and the editor so all three emit the same frame.
 *
 * `sandbox` keeps the player away from top-level navigation and forms.
 * `allow-same-origin` is safe here because the frame is always cross-origin
 * (the player host), and the players need it for their own storage.
 */
export const VIDEO_IFRAME_ATTRS = {
  allow:
    "accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture",
  loading: "lazy",
  referrerPolicy: "strict-origin-when-cross-origin",
  sandbox:
    "allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox",
} as const;

// ---------------------------------------------------------------------------
// Sanitizer
// ---------------------------------------------------------------------------

const BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "videoEmbed",
]);

interface Ctx {
  levels: readonly RichTextHeadingLevel[];
  embeds: boolean;
  throwTooDeep: boolean;
}

/** True when `depth` is past the limit; throws instead when the caller asked for that. */
function tooDeep(depth: number, ctx: Ctx): boolean {
  if (depth <= MAX_DEPTH) return false;
  if (ctx.throwTooDeep) throw new RichTextLimitError("depth", MAX_DEPTH, depth);
  return true;
}

function measure(nodes: RichTextNode[] | undefined, size = { nodes: 0, characters: 0 }) {
  for (const node of nodes ?? []) {
    size.nodes += 1;
    if (typeof node.text === "string") size.characters += node.text.length;
    measure(node.content, size);
  }
  return size;
}

/**
 * A cheap check on the raw input before sanitizing, so an oversized payload
 * is refused without walking all of it. It runs only when a limit is set,
 * iterates without recursion, and stops as soon as the input is clearly over:
 * more than 4x `maxNodes` raw nodes (the sanitizer drops wrappers and
 * unknown nodes) or 2x `maxCharacters` of raw text. Inputs within those
 * margins get the exact check after sanitizing.
 */
function precheckRawSize(root: RichTextNode, options: SanitizeRichTextOptions): void {
  const nodeBudget = options.maxNodes !== undefined ? options.maxNodes * 4 : Infinity;
  const charBudget = options.maxCharacters !== undefined ? options.maxCharacters * 2 : Infinity;
  let nodes = 0;
  let characters = 0;
  const stack: unknown[] = [root.content];
  while (stack.length > 0) {
    const list = stack.pop();
    if (!Array.isArray(list)) continue;
    for (const node of list) {
      if (!node || typeof node !== "object") continue;
      nodes += 1;
      const text = (node as RichTextNode).text;
      if (typeof text === "string") characters += text.length;
      if (nodes > nodeBudget) throw new RichTextLimitError("nodes", options.maxNodes!, nodes);
      if (characters > charBudget) {
        throw new RichTextLimitError("characters", options.maxCharacters!, characters);
      }
      stack.push((node as RichTextNode).content);
    }
  }
}

function sanitizeMarks(marks: unknown): RichTextMark[] | undefined {
  if (!Array.isArray(marks)) return undefined;
  const out: RichTextMark[] = [];
  const seen = new Set<string>();
  for (const mark of marks) {
    if (!mark || typeof mark !== "object") continue;
    const type = (mark as RichTextMark).type;
    if (seen.has(type)) continue;
    if (type === "bold" || type === "italic" || type === "underline") {
      out.push({ type });
      seen.add(type);
    } else if (type === "link") {
      const href = (mark as RichTextMark).attrs?.href;
      if (isSafeUrl(href)) {
        out.push({ type: "link", attrs: { href: href.trim() } });
        seen.add(type);
      }
    }
  }
  return out.length > 0 ? out : undefined;
}

function sanitizeInline(nodes: unknown, depth: number, ctx: Ctx): RichTextNode[] {
  if (!Array.isArray(nodes) || tooDeep(depth, ctx)) return [];
  const out: RichTextNode[] = [];
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const n = node as RichTextNode;
    if (n.type === "text") {
      if (typeof n.text !== "string" || n.text === "") continue;
      const marks = sanitizeMarks(n.marks);
      out.push(marks ? { type: "text", text: n.text, marks } : { type: "text", text: n.text });
    } else if (n.type === "hardBreak") {
      out.push({ type: "hardBreak" });
    } else if (Array.isArray(n.content)) {
      // An inline wrapper we do not know: keep its text, drop the wrapper.
      for (const child of sanitizeInline(n.content, depth + 1, ctx)) out.push(child);
    }
  }
  return out;
}

function withContent(
  type: string,
  content: RichTextNode[],
  attrs?: Record<string, unknown>,
): RichTextNode {
  const node: RichTextNode = { type };
  if (attrs) node.attrs = attrs;
  if (content.length > 0) node.content = content;
  return node;
}

function nearestLevel(
  level: unknown,
  levels: readonly RichTextHeadingLevel[],
): RichTextHeadingLevel {
  const n = typeof level === "number" ? level : 2;
  if ((levels as readonly number[]).includes(n)) return n as RichTextHeadingLevel;
  const sorted = [...levels].sort((a, b) => Math.abs(a - n) - Math.abs(b - n) || a - b);
  return sorted[0] ?? 2;
}

function sanitizeListItems(nodes: unknown, ctx: Ctx, depth: number): RichTextNode[] {
  if (!Array.isArray(nodes) || tooDeep(depth, ctx)) return [];
  const items: RichTextNode[] = [];
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const n = node as RichTextNode;
    const inner = n.type === "listItem" ? n.content : [n];
    // The editor's list item is `paragraph block*`, so headings, quotes and
    // embeds may follow the first paragraph; keep them rather than losing
    // content the author can see.
    const blocks = sanitizeBlocks(inner, ctx, depth + 1);
    // A list item starts with a paragraph in the editor's schema.
    if (blocks.length === 0 || blocks[0]!.type !== "paragraph") blocks.unshift({ type: "paragraph" });
    items.push({ type: "listItem", content: blocks });
  }
  return items;
}

function sanitizeBlocks(nodes: unknown, ctx: Ctx, depth: number): RichTextNode[] {
  if (!Array.isArray(nodes) || tooDeep(depth, ctx)) return [];
  const out: RichTextNode[] = [];
  let pendingInline: RichTextNode[] = [];
  const flushInline = () => {
    if (pendingInline.length > 0) out.push(withContent("paragraph", pendingInline));
    pendingInline = [];
  };

  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const n = node as RichTextNode;
    if (n.type === "text" || n.type === "hardBreak") {
      // Stray inline content at block level: gather it into a paragraph.
      for (const child of sanitizeInline([n], depth, ctx)) pendingInline.push(child);
      continue;
    }
    flushInline();
    switch (n.type) {
      case "paragraph":
        out.push(withContent("paragraph", sanitizeInline(n.content, depth + 1, ctx)));
        break;
      case "heading":
        out.push(
          withContent("heading", sanitizeInline(n.content, depth + 1, ctx), {
            level: nearestLevel(n.attrs?.level, ctx.levels),
          }),
        );
        break;
      case "bulletList":
      case "orderedList": {
        const items = sanitizeListItems(n.content, ctx, depth);
        if (items.length === 0) break;
        const start = n.attrs?.start;
        const attrs =
          n.type === "orderedList" &&
          typeof start === "number" &&
          Number.isInteger(start) &&
          start > 1
            ? { start: Math.min(start, 1_000_000) }
            : undefined;
        out.push(withContent(n.type, items, attrs));
        break;
      }
      case "listItem":
        // A list item outside a list: keep its blocks.
        for (const child of sanitizeBlocks(n.content, ctx, depth + 1)) out.push(child);
        break;
      case "blockquote": {
        const inner = sanitizeBlocks(n.content, ctx, depth + 1);
        out.push(withContent("blockquote", inner.length > 0 ? inner : [{ type: "paragraph" }]));
        break;
      }
      case "videoEmbed": {
        if (!ctx.embeds) break;
        const attrs = sanitizeVideoEmbedAttrs(n.attrs);
        if (attrs) out.push({ type: "videoEmbed", attrs: { ...attrs } });
        break;
      }
      default:
        // Unknown block (code block, table, image…): keep its text as a
        // paragraph rather than silently losing what someone wrote.
        if (Array.isArray(n.content)) {
          const nested = n.content.some(
            (c) => !!c && typeof c === "object" && BLOCK_TYPES.has((c as RichTextNode).type),
          );
          if (nested) for (const child of sanitizeBlocks(n.content, ctx, depth + 1)) out.push(child);
          else {
            const inline = sanitizeInline(n.content, depth + 1, ctx);
            if (inline.length > 0) out.push(withContent("paragraph", inline));
          }
        }
    }
  }
  flushInline();
  return out;
}

/**
 * Validate an untrusted value as a rich text document and return a clean
 * copy that contains only allow-listed nodes, marks and attributes.
 *
 * `null`, a string or a malformed object becomes an empty document. Run
 * this on the server on every write, before storing the JSON or deriving
 * HTML from it, with limits so a client cannot store an oversized or
 * pathologically nested document:
 *
 * ```ts
 * sanitizeRichTextDoc(body, { maxCharacters: 50_000, maxNodes: 5_000, onTooDeep: "throw" });
 * ```
 *
 * Without limits it never throws; with them it throws `RichTextLimitError`.
 */
export function sanitizeRichTextDoc(
  input: unknown,
  options: SanitizeRichTextOptions = {},
): RichTextDoc {
  const levels =
    options.headingLevels && options.headingLevels.length > 0
      ? options.headingLevels
      : ([2, 3, 4] as const);
  const ctx: Ctx = { levels, embeds: options.embeds ?? true, throwTooDeep: options.onTooDeep === "throw" };
  const root = input && typeof input === "object" ? (input as RichTextNode) : null;
  if (root && (options.maxCharacters !== undefined || options.maxNodes !== undefined)) {
    precheckRawSize(root, options);
  }
  const content = root && root.type === "doc" ? sanitizeBlocks(root.content, ctx, 0) : [];
  // Trailing empty paragraphs carry no meaning (the editor keeps one after
  // the last block so there is always somewhere to type); drop them so
  // stored documents and derived HTML do not end in `<p></p>`.
  while (content.length > 1) {
    const last = content[content.length - 1]!;
    if (last.type !== "paragraph" || last.content) break;
    content.pop();
  }
  if (options.maxCharacters !== undefined || options.maxNodes !== undefined) {
    const size = measure(content);
    if (options.maxCharacters !== undefined && size.characters > options.maxCharacters) {
      throw new RichTextLimitError("characters", options.maxCharacters, size.characters);
    }
    if (options.maxNodes !== undefined && size.nodes > options.maxNodes) {
      throw new RichTextLimitError("nodes", options.maxNodes, size.nodes);
    }
  }
  return { type: "doc", content: content.length > 0 ? content : [{ type: "paragraph" }] };
}

/** True when `value` is shaped like a rich text document (`{ type: "doc" }`). */
export function isRichTextDoc(value: unknown): value is RichTextDoc {
  return (
    !!value &&
    typeof value === "object" &&
    (value as RichTextNode).type === "doc" &&
    Array.isArray((value as RichTextNode).content)
  );
}

// ---------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------

/** Escape text for use in HTML element content and quoted attributes. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** True for absolute http(s) links, which open in a new tab. */
export function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

const MARK_ORDER = ["link", "bold", "italic", "underline"];

/** Marks in a fixed nesting order (link outermost) so output is stable. */
export function orderedMarks(marks: RichTextMark[] | undefined): RichTextMark[] {
  if (!marks) return [];
  return [...marks].sort((a, b) => MARK_ORDER.indexOf(a.type) - MARK_ORDER.indexOf(b.type));
}

function linkAttrs(href: string): string {
  const safe = escapeHtml(href);
  return isExternalHref(href)
    ? `href="${safe}" target="_blank" rel="noopener noreferrer nofollow"`
    : `href="${safe}"`;
}

function inlineToHtml(nodes: RichTextNode[] | undefined): string {
  if (!nodes) return "";
  let html = "";
  for (const node of nodes) {
    if (node.type === "hardBreak") {
      html += "<br>";
      continue;
    }
    let text = escapeHtml(node.text ?? "");
    const marks = orderedMarks(node.marks);
    for (let i = marks.length - 1; i >= 0; i--) {
      const mark = marks[i]!;
      if (mark.type === "bold") text = `<strong>${text}</strong>`;
      else if (mark.type === "italic") text = `<em>${text}</em>`;
      else if (mark.type === "underline") text = `<u>${text}</u>`;
      else if (mark.type === "link") text = `<a ${linkAttrs(String(mark.attrs?.href))}>${text}</a>`;
    }
    html += text;
  }
  return html;
}

function embedToHtml(attrs: VideoEmbedAttrs, embedAs: "iframe" | "link"): string {
  const title = escapeHtml(videoEmbedTitle(attrs));
  if (embedAs === "link") {
    return `<p><a ${linkAttrs(videoWatchUrl(attrs))}>${title}</a></p>`;
  }
  const a = VIDEO_IFRAME_ATTRS;
  const data = `data-video-embed="" data-provider="${attrs.provider}" data-id="${escapeHtml(attrs.id)}"${
    attrs.hash ? ` data-hash="${escapeHtml(attrs.hash)}"` : ""
  }${attrs.title ? ` data-title="${title}"` : ""}`;
  return (
    `<div ${data}>` +
    `<iframe src="${escapeHtml(videoEmbedSrc(attrs))}" title="${title}" allow="${a.allow}" allowfullscreen ` +
    `loading="${a.loading}" referrerpolicy="${a.referrerPolicy}" sandbox="${a.sandbox}"></iframe>` +
    `</div>`
  );
}

function blocksToHtml(nodes: RichTextNode[] | undefined, embedAs: "iframe" | "link"): string {
  if (!nodes) return "";
  let html = "";
  for (const node of nodes) {
    switch (node.type) {
      case "paragraph":
        html += `<p>${inlineToHtml(node.content)}</p>`;
        break;
      case "heading": {
        const level = node.attrs?.level as number;
        html += `<h${level}>${inlineToHtml(node.content)}</h${level}>`;
        break;
      }
      case "bulletList":
        html += `<ul>${blocksToHtml(node.content, embedAs)}</ul>`;
        break;
      case "orderedList": {
        const start = node.attrs?.start;
        html += `<ol${typeof start === "number" ? ` start="${start}"` : ""}>${blocksToHtml(node.content, embedAs)}</ol>`;
        break;
      }
      case "listItem":
        html += `<li>${blocksToHtml(node.content, embedAs)}</li>`;
        break;
      case "blockquote":
        html += `<blockquote>${blocksToHtml(node.content, embedAs)}</blockquote>`;
        break;
      case "videoEmbed":
        html += embedToHtml(node.attrs as unknown as VideoEmbedAttrs, embedAs);
        break;
    }
  }
  return html;
}

/**
 * Serialize a document to HTML. The input is sanitized first, so this is
 * safe to call on untrusted JSON; the output contains only the tags listed
 * in this file's header, with every value escaped.
 */
export function richTextToHtml(doc: unknown, options: RichTextToHtmlOptions = {}): string {
  const clean = sanitizeRichTextDoc(doc, options);
  return blocksToHtml(clean.content, options.embedAs ?? "iframe");
}

function collectText(nodes: RichTextNode[] | undefined, out: string[]): void {
  if (!nodes) return;
  for (const node of nodes) {
    if (node.type === "text") out.push(node.text ?? "");
    else if (node.type === "hardBreak") out.push("\n");
    else if (node.type === "videoEmbed") {
      const attrs = sanitizeVideoEmbedAttrs(node.attrs);
      if (attrs) out.push(`${videoEmbedTitle(attrs)} (${videoWatchUrl(attrs)})`, "\n\n");
    } else if (
      node.type === "listItem" ||
      node.type === "bulletList" ||
      node.type === "orderedList" ||
      node.type === "blockquote"
    ) {
      collectText(node.content, out);
    } else {
      collectText(node.content, out);
      out.push("\n\n");
    }
  }
}

/**
 * Plain text for search indexes, previews and notifications. Blocks are
 * separated by blank lines; embeds become "Title (url)".
 */
export function richTextToPlainText(doc: unknown): string {
  const clean = sanitizeRichTextDoc(doc);
  const out: string[] = [];
  collectText(clean.content, out);
  return out.join("").replace(/\n{3,}/g, "\n\n").trim();
}

/** True when the document has no visible text and no embeds. */
export function isRichTextEmpty(doc: unknown): boolean {
  const clean = sanitizeRichTextDoc(doc);
  const walk = (nodes: RichTextNode[] | undefined): boolean =>
    !nodes ||
    nodes.every((n) => {
      if (n.type === "videoEmbed") return false;
      if (n.type === "text") return (n.text ?? "").trim() === "";
      return walk(n.content);
    });
  return walk(clean.content);
}
