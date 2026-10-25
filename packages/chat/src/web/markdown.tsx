/**
 * @feat:chat
 * The safe inline markdown a message body is written in: **bold**, *italic*
 * (or _italic_), `code`, [links](https://…), bare https links, line breaks and
 * mentions written `@[Name](user:<uuid>)`. A small tokenizer turns the text
 * into nodes and the nodes into React elements, so every character of the
 * body reaches the page as text: no HTML is ever parsed, and nothing uses
 * dangerouslySetInnerHTML. Links open only for http and https.
 */
import { Fragment, type ReactNode } from "react";
import { cn } from "@marktiderman/genesis-ui";

export type MarkdownNode =
  | { type: "text"; text: string }
  | { type: "bold"; children: MarkdownNode[] }
  | { type: "italic"; children: MarkdownNode[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; children: MarkdownNode[] }
  | { type: "mention"; name: string; userId: string }
  | { type: "break" };

/** True for an absolute http or https URL; everything else (javascript:, data:, relative) is refused. */
export function isSafeHref(href: string): boolean {
  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const MENTION = /^@\[([^\]\n]{1,80})\]\(user:([0-9a-f-]{36})\)/i;
const LINK = /^\[([^\]\n]{1,300})\]\(((?:[^()\s]|\([^()\s]*\)){1,2000})\)/;
const BARE_URL = /^https?:\/\/[^\s<>"]+/i;
const TRAILING_PUNCTUATION = /[.,;:!?)\]'"]+$/;

/** Parses one message body into inline nodes. Never throws. */
export function parseMarkdown(text: string): MarkdownNode[] {
  const out: MarkdownNode[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  lines.forEach((line, i) => {
    if (i > 0) out.push({ type: "break" });
    out.push(...parseInline(line, 0));
  });
  return mergeText(out);
}

function parseInline(src: string, depth: number): MarkdownNode[] {
  const out: MarkdownNode[] = [];
  let text = "";
  const flush = () => {
    if (text) out.push({ type: "text", text });
    text = "";
  };
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    const rest = src.slice(i);
    const prev = i > 0 ? src[i - 1]! : "";

    if (ch === "\\" && i + 1 < src.length && /[*_`[\]@\\]/.test(src[i + 1]!)) {
      text += src[i + 1];
      i += 2;
      continue;
    }

    if (ch === "`") {
      const end = src.indexOf("`", i + 1);
      if (end > i + 1) {
        flush();
        out.push({ type: "code", text: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    if (ch === "@") {
      const m = MENTION.exec(rest);
      if (m) {
        flush();
        out.push({ type: "mention", name: m[1]!, userId: m[2]!.toLowerCase() });
        i += m[0].length;
        continue;
      }
    }

    if (ch === "[") {
      const m = LINK.exec(rest);
      if (m) {
        flush();
        const label = depth < 3 ? parseInline(m[1]!, depth + 1) : [{ type: "text" as const, text: m[1]! }];
        if (isSafeHref(m[2]!)) out.push({ type: "link", href: m[2]!, children: label });
        // A link we won't open keeps its words and drops the target.
        else out.push(...label);
        i += m[0].length;
        continue;
      }
    }

    if ((ch === "h" || ch === "H") && !/[\w/]/.test(prev)) {
      const m = BARE_URL.exec(rest);
      if (m) {
        const url = m[0].replace(TRAILING_PUNCTUATION, "");
        if (isSafeHref(url)) {
          flush();
          out.push({ type: "link", href: url, children: [{ type: "text", text: url }] });
          i += url.length;
          continue;
        }
      }
    }

    if ((ch === "*" || ch === "_") && depth < 3) {
      const double = src[i + 1] === ch;
      const marker = double ? ch + ch : ch;
      // `_` only opens at a word edge, so snake_case stays as written.
      const opens = ch === "*" || !/\w/.test(prev);
      const after = src[i + marker.length];
      if (opens && after && after !== " " && after !== ch) {
        const end = findClose(src, i + marker.length, marker);
        if (end > 0) {
          flush();
          const inner = parseInline(src.slice(i + marker.length, end), depth + 1);
          out.push(double ? { type: "bold", children: inner } : { type: "italic", children: inner });
          i = end + marker.length;
          continue;
        }
      }
    }

    text += ch;
    i += 1;
  }
  flush();
  return out;
}

/** Where `marker` closes: not after a space, and (for `_`) at a word edge. */
function findClose(src: string, from: number, marker: string): number {
  let j = from;
  while (j < src.length) {
    const k = src.indexOf(marker, j);
    if (k < 0) return -1;
    const before = src[k - 1]!;
    const next = src[k + marker.length];
    const doubled = marker.length === 1 && next === marker;
    const edge = marker[0] !== "_" || !next || !/\w/.test(next);
    if (k > from && before !== " " && !doubled && edge) return k;
    j = k + (doubled ? 2 : 1);
  }
  return -1;
}

function mergeText(nodes: MarkdownNode[]): MarkdownNode[] {
  const out: MarkdownNode[] = [];
  for (const n of nodes) {
    const last = out[out.length - 1];
    if (n.type === "text" && last?.type === "text") last.text += n.text;
    else out.push(n);
  }
  return out;
}

export interface ChatMarkdownProps {
  /** The message body. */
  text: string;
  /** Draws a mention; a highlighted chip by default. */
  renderMention?: (mention: { name: string; userId: string }) => ReactNode;
  /** Mentions of this user are drawn stronger. */
  me?: string;
  /** Bubble colours: on `primary`, links and chips use the primary foreground. */
  tone?: "default" | "primary";
  className?: string;
}

/** Renders a message body's inline markdown as React elements. */
export function ChatMarkdown({ text, renderMention, me, tone = "default", className }: ChatMarkdownProps) {
  const nodes = parseMarkdown(text);
  return <span className={cn("whitespace-pre-wrap break-words [overflow-wrap:anywhere]", className)}>{renderNodes(nodes, { renderMention, me, tone })}</span>;
}

interface RenderOptions {
  renderMention?: ChatMarkdownProps["renderMention"];
  me?: string;
  tone: "default" | "primary";
}

function renderNodes(nodes: MarkdownNode[], opts: RenderOptions): ReactNode[] {
  return nodes.map((n, i) => {
    switch (n.type) {
      case "text":
        return <Fragment key={i}>{n.text}</Fragment>;
      case "break":
        return <br key={i} />;
      case "bold":
        return <strong key={i} className="font-semibold">{renderNodes(n.children, opts)}</strong>;
      case "italic":
        return <em key={i}>{renderNodes(n.children, opts)}</em>;
      case "code":
        return (
          <code
            key={i}
            className={cn(
              "rounded px-1 py-0.5 font-mono text-[0.85em]",
              opts.tone === "primary" ? "bg-primary-foreground/15" : "bg-background/70",
            )}
          >
            {n.text}
          </code>
        );
      case "link":
        return (
          <a
            key={i}
            href={n.href}
            target="_blank"
            rel="noopener noreferrer"
            className={cn("underline underline-offset-2", opts.tone === "primary" ? "text-primary-foreground" : "text-primary")}
          >
            {renderNodes(n.children, opts)}
          </a>
        );
      case "mention": {
        if (opts.renderMention) return <Fragment key={i}>{opts.renderMention(n)}</Fragment>;
        const mine = opts.me && n.userId === opts.me.toLowerCase();
        return (
          <span
            key={i}
            data-mention={n.userId}
            className={cn(
              "rounded px-1 font-medium",
              opts.tone === "primary"
                ? "bg-primary-foreground/20 text-primary-foreground"
                : mine
                  ? "bg-primary/20 text-primary"
                  : "bg-primary/10 text-primary",
            )}
          >
            @{n.name}
          </span>
        );
      }
    }
  });
}
