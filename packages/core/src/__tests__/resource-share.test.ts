// @feat:resource-workspace
import { describe, expect, it } from "vitest";
import { embedSnippet, prefilledUrl } from "../resource";

describe("Share helpers", () => {
  it("adds prefilled values to a link, leaving empty ones out", () => {
    expect(
      prefilledUrl("https://app.test/p/welcome", { location: "North hall", staff: "" }),
    ).toBe("https://app.test/p/welcome?location=North+hall");
    expect(prefilledUrl("https://app.test/qr?page=a", { staff: "c1" })).toBe(
      "https://app.test/qr?page=a&staff=c1",
    );
  });

  it("embeds the page in an iframe, escaping its title", () => {
    const html = embedSnippet("https://app.test/f/a?x=1&y=2", 'Say "hi" <now>');
    expect(html).toContain('src="https://app.test/f/a?x=1&amp;y=2"');
    expect(html).toContain('title="Say &quot;hi&quot; &lt;now&gt;"');
    expect(html.startsWith("<iframe")).toBe(true);
  });
});

describe("relative links", () => {
  it("prefills a relative link without throwing, and keeps it relative", () => {
    expect(prefilledUrl("/p/welcome", { location: "North hall" })).toBe(
      "/p/welcome?location=North+hall",
    );
    expect(prefilledUrl("/qr?page=a#top", { staff: "c1", location: "" })).toBe("/qr?page=a&staff=c1#top");
    expect(prefilledUrl("f/a", { x: "1" })).toBe("f/a?x=1");
  });
});
