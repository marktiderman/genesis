// @feat:rich-text
/**
 * RichText renders stored JSON as React elements. It must render the same
 * structure the HTML serializer writes, render on the server (no hooks), and
 * never put an unsafe URL or a foreign iframe on the page.
 */
import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RichText, type RichTextDoc } from "../rich-text";

const lesson: RichTextDoc = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Systems over goals" }] },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Read " },
        { type: "text", text: "Atomic Habits", marks: [{ type: "italic" }, { type: "link", attrs: { href: "https://example.com/book" } }] },
        { type: "text", text: " then " },
        { type: "text", text: "this", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] },
      ],
    },
    { type: "videoEmbed", attrs: { provider: "youtube", id: "dQw4w9WgXcQ", title: "Week 2 intro" } },
    { type: "videoEmbed", attrs: { provider: "other", id: "x", src: "https://evil.example" } },
  ],
};

describe("RichText", () => {
  it("renders headings, marks, safe links and allow-listed embeds", () => {
    render(<RichText value={lesson} testID="rt" />);
    expect(screen.getByRole("heading", { level: 2, name: "Systems over goals" })).toBeTruthy();

    const link = screen.getByRole("link", { name: "Atomic Habits" });
    expect(link.getAttribute("href")).toBe("https://example.com/book");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer nofollow");
    expect(link.querySelector("em")).toBeTruthy();

    // The javascript: link is reduced to its text.
    expect(screen.queryByRole("link", { name: "this" })).toBeNull();
    expect(screen.getByTestId("rt").textContent).toContain("then this");

    const frames = screen.getByTestId("rt").querySelectorAll("iframe");
    expect(frames).toHaveLength(1);
    expect(frames[0]!.getAttribute("src")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(frames[0]!.getAttribute("title")).toBe("Week 2 intro");
    expect(frames[0]!.getAttribute("sandbox")).toContain("allow-scripts");
  });

  it("renders embeds as links when embeds={false}", () => {
    render(<RichText value={lesson} embeds={false} testID="rt" />);
    expect(screen.getByTestId("rt").querySelector("iframe")).toBeNull();
    expect(screen.getByRole("link", { name: "Week 2 intro" }).getAttribute("href")).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
  });

  it("server-renders without hooks or a DOM, escaping text", () => {
    const html = renderToStaticMarkup(
      <RichText value={{ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "<b>x</b>" }] }] }} />,
    );
    expect(html).toContain("<p>&lt;b&gt;x&lt;/b&gt;</p>");
  });

  it("renders an empty container for null", () => {
    render(<RichText value={null} testID="rt" />);
    expect(screen.getByTestId("rt").childElementCount).toBe(0);
  });
});
