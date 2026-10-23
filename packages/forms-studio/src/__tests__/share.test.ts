// @feat:forms-studio
import { describe, expect, it } from "vitest";
import { embedSnippet, prefilledUrl } from "../generic/share";

describe("Share helpers", () => {
  it("adds prefilled values to a link, leaving empty ones out", () => {
    expect(
      prefilledUrl("https://app.test/f/cff/after-class", { class: "6:00 WOD", coach: "" }),
    ).toBe("https://app.test/f/cff/after-class?class=6%3A00+WOD");
    expect(prefilledUrl("https://app.test/qr?form=a", { coach: "c1" })).toBe(
      "https://app.test/qr?form=a&coach=c1",
    );
  });

  it("embeds the form in an iframe, escaping its title", () => {
    const html = embedSnippet("https://app.test/f/a?x=1&y=2", 'Say "hi" <now>');
    expect(html).toContain('src="https://app.test/f/a?x=1&amp;y=2"');
    expect(html).toContain('title="Say &quot;hi&quot; &lt;now&gt;"');
    expect(html.startsWith("<iframe")).toBe(true);
  });
});

