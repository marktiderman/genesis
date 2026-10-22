/**
 * The allow-list is the security boundary for rich text: everything a server
 * stores and every page that renders it goes through `sanitizeRichTextDoc`.
 * These tests pin what it keeps, what it drops and what the serializers emit.
 */
import { describe, expect, it } from "vitest";

import {
  isRichTextEmpty,
  isSafeUrl,
  normalizeLinkUrl,
  parseVideoUrl,
  RichTextLimitError,
  richTextToHtml,
  richTextToPlainText,
  sanitizeRichTextDoc,
  type RichTextDoc,
} from "../rich-text-doc";

const p = (...content: object[]) => ({ type: "paragraph", content });
const t = (text: string, marks?: object[]) => (marks ? { type: "text", text, marks } : { type: "text", text });
const doc = (...content: object[]) => ({ type: "doc", content }) as RichTextDoc;

describe("isSafeUrl", () => {
  it.each([
    "https://example.com",
    "http://example.com/a?b=c#d",
    "mailto:coach@example.com",
    "tel:+15551234",
    "/lessons/1",
    "#notes",
  ])("accepts %s", (url) => expect(isSafeUrl(url)).toBe(true));

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    " javascript:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox",
    "//evil.example",
    "/\\evil.example",
    "file:///etc/passwd",
    "",
    "not a url",
  ])("rejects %j", (url) => expect(isSafeUrl(url)).toBe(false));

  it("rejects non-strings", () => {
    expect(isSafeUrl(undefined)).toBe(false);
    expect(isSafeUrl({ toString: () => "https://x" })).toBe(false);
  });
});

describe("normalizeLinkUrl", () => {
  it("adds https to bare hosts and mailto to emails", () => {
    expect(normalizeLinkUrl("example.com/page")).toBe("https://example.com/page");
    expect(normalizeLinkUrl("coach@example.com")).toBe("mailto:coach@example.com");
    expect(normalizeLinkUrl("  https://example.com ")).toBe("https://example.com");
  });
  it("refuses unsafe or meaningless input", () => {
    expect(normalizeLinkUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeLinkUrl("hello")).toBeNull();
    expect(normalizeLinkUrl("")).toBeNull();
  });
});

describe("parseVideoUrl", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", { provider: "youtube", id: "dQw4w9WgXcQ" }],
    ["https://youtu.be/dQw4w9WgXcQ?t=42", { provider: "youtube", id: "dQw4w9WgXcQ" }],
    ["https://m.youtube.com/shorts/dQw4w9WgXcQ", { provider: "youtube", id: "dQw4w9WgXcQ" }],
    ["https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", { provider: "youtube", id: "dQw4w9WgXcQ" }],
    ["https://vimeo.com/76979871", { provider: "vimeo", id: "76979871" }],
    ["https://vimeo.com/76979871/abc123def", { provider: "vimeo", id: "76979871", hash: "abc123def" }],
    ["https://player.vimeo.com/video/76979871?h=abc123", { provider: "vimeo", id: "76979871", hash: "abc123" }],
    ["https://vimeo.com/showcase/111/video/222", { provider: "vimeo", id: "222" }],
    ["https://vimeo.com/123456/videos", { provider: "vimeo", id: "123456" }],
    [
      "https://www.loom.com/share/0281766fa2d04bb788eaf19e65135184",
      { provider: "loom", id: "0281766fa2d04bb788eaf19e65135184" },
    ],
  ])("recognises %s", (url, expected) => expect(parseVideoUrl(url)).toEqual(expected));

  it.each([
    "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
    "https://evilyoutube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ\"onload=x",
    "javascript:alert(1)//youtube.com/watch?v=dQw4w9WgXcQ",
    "https://vimeo.com/about",
    "https://www.loom.com/looms/videos",
    "https://example.com/video.mp4",
  ])("rejects %s", (url) => expect(parseVideoUrl(url)).toBeNull());
});

describe("sanitizeRichTextDoc", () => {
  it("keeps the allow-listed structure unchanged", () => {
    const input = doc(
      { type: "heading", attrs: { level: 2 }, content: [t("Week 1")] },
      p(t("Habits "), t("compound", [{ type: "bold" }, { type: "italic" }]), { type: "hardBreak" }, t("daily")),
      { type: "bulletList", content: [{ type: "listItem", content: [p(t("one"))] }] },
      { type: "orderedList", attrs: { start: 3 }, content: [{ type: "listItem", content: [p(t("three"))] }] },
      { type: "blockquote", content: [p(t("quote", [{ type: "underline" }]))] },
      p(t("site", [{ type: "link", attrs: { href: "https://example.com" } }])),
      { type: "videoEmbed", attrs: { provider: "youtube", id: "dQw4w9WgXcQ", title: "Intro" } },
    );
    expect(sanitizeRichTextDoc(input)).toEqual(input);
  });

  it("returns an empty document for garbage", () => {
    for (const bad of [null, undefined, "<p>x</p>", 42, {}, { type: "doc" }, { type: "paragraph" }]) {
      expect(sanitizeRichTextDoc(bad)).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
    }
  });

  it("drops unsafe links but keeps their text", () => {
    const out = sanitizeRichTextDoc(
      doc(p(t("click", [{ type: "link", attrs: { href: "javascript:alert(1)" } }, { type: "bold" }]))),
    );
    expect(out.content[0]).toEqual(p(t("click", [{ type: "bold" }])));
  });

  it("drops unknown marks, attributes and event-handler-ish attrs", () => {
    const out = sanitizeRichTextDoc(
      doc({
        type: "paragraph",
        attrs: { onclick: "alert(1)", class: "x" },
        content: [t("hi", [{ type: "textStyle", attrs: { style: "background:url(javascript:x)" } }])],
      }),
    );
    expect(out).toEqual(doc(p(t("hi"))));
  });

  it("keeps the text of unknown blocks as paragraphs", () => {
    const out = sanitizeRichTextDoc(doc({ type: "codeBlock", content: [t("let x = 1")] }, { type: "iframe" }));
    expect(out).toEqual(doc(p(t("let x = 1"))));
  });

  it("drops embeds that are not allow-listed videos, or when embeds are off", () => {
    const bad = { type: "videoEmbed", attrs: { provider: "youtube", id: "\"><script>" } };
    const evil = { type: "videoEmbed", attrs: { provider: "evil", id: "x", src: "https://evil.example" } };
    const good = { type: "videoEmbed", attrs: { provider: "vimeo", id: "123", src: "https://evil.example" } };
    expect(sanitizeRichTextDoc(doc(bad, evil, good)).content).toEqual([
      { type: "videoEmbed", attrs: { provider: "vimeo", id: "123" } },
    ]);
    expect(sanitizeRichTextDoc(doc(good), { embeds: false })).toEqual(doc({ type: "paragraph" }));
  });

  it("clamps heading levels to the allowed set", () => {
    const out = sanitizeRichTextDoc(
      doc({ type: "heading", attrs: { level: 1 }, content: [t("a")] }, { type: "heading", attrs: { level: 6 }, content: [t("b")] }),
      { headingLevels: [2, 3] },
    );
    expect(out.content.map((n) => n.attrs?.level)).toEqual([2, 3]);
  });

  it("drops trailing empty paragraphs but keeps one for an empty document", () => {
    expect(sanitizeRichTextDoc(doc(p(t("a")), { type: "paragraph" }, { type: "paragraph" }))).toEqual(doc(p(t("a"))));
    expect(sanitizeRichTextDoc(doc({ type: "paragraph" }, { type: "paragraph" }))).toEqual(doc({ type: "paragraph" }));
  });

  it("keeps headings and embeds nested in list items and quotes (the editor allows them)", () => {
    const input = doc(
      { type: "bulletList", content: [{ type: "listItem", content: [p(t("a")), { type: "heading", attrs: { level: 2 }, content: [t("Title")] }] }] },
      { type: "blockquote", content: [{ type: "videoEmbed", attrs: { provider: "vimeo", id: "1" } }] },
    );
    expect(sanitizeRichTextDoc(input)).toEqual(input);
  });

  it("does not throw on very wide input", () => {
    const wide = doc({ type: "wrapper", content: [{ type: "span", content: Array.from({ length: 200_000 }, () => ({ type: "hardBreak" })) }] });
    expect(() => sanitizeRichTextDoc(wide)).not.toThrow();
  });

  it("survives very deep nesting without recursing forever", () => {
    let node: object = p(t("deep"));
    for (let i = 0; i < 10_000; i++) node = { type: "blockquote", content: [node] };
    expect(() => sanitizeRichTextDoc(doc(node))).not.toThrow();
  });

  it("rejects too-deep nesting with onTooDeep: throw, and keeps 32 levels", () => {
    const nest = (levels: number) => {
      let node: object = p(t("deep"));
      for (let i = 0; i < levels; i++) node = { type: "blockquote", content: [node] };
      return doc(node);
    };
    expect(() => sanitizeRichTextDoc(nest(31), { onTooDeep: "throw" })).not.toThrow();
    expect(richTextToPlainText(sanitizeRichTextDoc(nest(31)))).toBe("deep");
    const err = (() => {
      try {
        sanitizeRichTextDoc(nest(40), { onTooDeep: "throw" });
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(RichTextLimitError);
    expect(err).toMatchObject({ reason: "depth", limit: 32 });
    // The default still drops it, for rendering stored documents.
    expect(richTextToPlainText(sanitizeRichTextDoc(nest(40)))).toBe("");
  });

  it("enforces maxCharacters and maxNodes after sanitizing", () => {
    const input = doc(p(t("hello "), t("world", [{ type: "bold" }])), { type: "codeBlock", content: [t("x")] });
    // 2 paragraphs + 3 text nodes = 5 nodes; 12 characters.
    expect(() => sanitizeRichTextDoc(input, { maxCharacters: 12, maxNodes: 5 })).not.toThrow();
    expect(() => sanitizeRichTextDoc(input, { maxCharacters: 11 })).toThrow(
      expect.objectContaining({ reason: "characters", limit: 11, actual: 12 }),
    );
    expect(() => sanitizeRichTextDoc(input, { maxNodes: 4 })).toThrow(
      expect.objectContaining({ reason: "nodes", limit: 4, actual: 5 }),
    );
    // Content the allow-list drops does not count toward the limits.
    const dropped = doc(p(t("ok")), { type: "script", attrs: { src: "x".repeat(1000) } });
    expect(() => sanitizeRichTextDoc(dropped, { maxCharacters: 2, maxNodes: 2 })).not.toThrow();
  });
});

describe("richTextToHtml", () => {
  it("serializes the allow-listed structure", () => {
    const html = richTextToHtml(
      doc(
        { type: "heading", attrs: { level: 3 }, content: [t("Title")] },
        p(t("a "), t("b", [{ type: "bold" }]), t(" "), t("c", [{ type: "link", attrs: { href: "/x" } }])),
        p(t("ext", [{ type: "link", attrs: { href: "https://example.com" } }])),
      ),
    );
    expect(html).toBe(
      '<h3>Title</h3><p>a <strong>b</strong> <a href="/x">c</a></p>' +
        '<p><a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow">ext</a></p>',
    );
  });

  it("escapes text and never emits scripts, handlers or javascript: URLs", () => {
    const html = richTextToHtml(
      doc(
        p(t('<script>alert(1)</script><img src=x onerror="alert(1)">')),
        p(t("x", [{ type: "link", attrs: { href: "javascript:alert(1)" } }])),
        p(t("y", [{ type: "link", attrs: { href: 'https://e.com/"onmouseover="alert(1)' } }])),
        { type: "videoEmbed", attrs: { provider: "youtube", id: "dQw4w9WgXcQ", title: '"><script>x</script>' } },
      ),
    );
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toMatch(/"\s*onmouseover=/i);
    expect(html).toContain("&lt;script&gt;");
    // The only iframe is the rebuilt player URL.
    expect(html.match(/<iframe/g)).toHaveLength(1);
    expect(html).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"');
    expect(html).toContain("sandbox=");
  });

  it("can write embeds as links (for email)", () => {
    const html = richTextToHtml(doc({ type: "videoEmbed", attrs: { provider: "loom", id: "abcdef12" } }), {
      embedAs: "link",
    });
    expect(html).toBe(
      '<p><a href="https://www.loom.com/share/abcdef12" target="_blank" rel="noopener noreferrer nofollow">Loom video</a></p>',
    );
  });
});

describe("richTextToPlainText / isRichTextEmpty", () => {
  it("flattens blocks with blank lines", () => {
    const text = richTextToPlainText(
      doc(
        { type: "heading", attrs: { level: 2 }, content: [t("Title")] },
        p(t("Line"), { type: "hardBreak" }, t("two")),
        { type: "bulletList", content: [{ type: "listItem", content: [p(t("item"))] }] },
      ),
    );
    expect(text).toBe("Title\n\nLine\ntwo\n\nitem");
  });

  it("treats whitespace-only documents as empty, embeds as content", () => {
    expect(isRichTextEmpty(doc(p(t("   "))))).toBe(true);
    expect(isRichTextEmpty(null)).toBe(true);
    expect(isRichTextEmpty(doc(p(t("x"))))).toBe(false);
    expect(isRichTextEmpty(doc({ type: "videoEmbed", attrs: { provider: "vimeo", id: "1" } }))).toBe(false);
  });
});
