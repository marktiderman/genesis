/**
 * @vitest-environment happy-dom
 * @feat:chat
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ChatMarkdown, isSafeHref, parseMarkdown } from "../web/markdown";

afterEach(cleanup);

const UUID = "3f2b8c1e-0d4a-4c6b-9e1f-2a3b4c5d6e7f";

describe("parseMarkdown", () => {
  it("reads bold, italic, code, links, mentions and line breaks", () => {
    expect(parseMarkdown(`**hi** *there* _you_ \`x<y\` [site](https://example.com) @[Sam Lee](user:${UUID})\nnext`)).toEqual([
      { type: "bold", children: [{ type: "text", text: "hi" }] },
      { type: "text", text: " " },
      { type: "italic", children: [{ type: "text", text: "there" }] },
      { type: "text", text: " " },
      { type: "italic", children: [{ type: "text", text: "you" }] },
      { type: "text", text: " " },
      { type: "code", text: "x<y" },
      { type: "text", text: " " },
      { type: "link", href: "https://example.com", children: [{ type: "text", text: "site" }] },
      { type: "text", text: " " },
      { type: "mention", name: "Sam Lee", userId: UUID },
      { type: "break" },
      { type: "text", text: "next" },
    ]);
  });

  it("leaves snake_case, lone stars and unclosed markers as written", () => {
    expect(parseMarkdown("my_var_name and 2 * 3 and **open")).toEqual([{ type: "text", text: "my_var_name and 2 * 3 and **open" }]);
  });

  it("links bare https URLs without their trailing punctuation", () => {
    expect(parseMarkdown("see https://example.com/a?b=1.")).toEqual([
      { type: "text", text: "see " },
      { type: "link", href: "https://example.com/a?b=1", children: [{ type: "text", text: "https://example.com/a?b=1" }] },
      { type: "text", text: "." },
    ]);
  });

  it("keeps a link's words but drops a javascript:, data: or relative target", () => {
    for (const href of ["javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,<b>x</b>", "/relative", "vbscript:x"]) {
      const nodes = parseMarkdown(`[click](${href})`);
      expect(nodes.some((n) => n.type === "link")).toBe(false);
      expect(nodes).toEqual([{ type: "text", text: "click" }]);
    }
    expect(isSafeHref("https://ok.example")).toBe(true);
    expect(isSafeHref("http://ok.example")).toBe(true);
    expect(isSafeHref("javascript:alert(1)")).toBe(false);
    expect(isSafeHref("mailto:a@b.c")).toBe(false);
  });

  it("honours backslash escapes", () => {
    expect(parseMarkdown("\\*not italic\\*")).toEqual([{ type: "text", text: "*not italic*" }]);
  });
});

describe("ChatMarkdown", () => {
  it("renders HTML in a message as text, never as elements", () => {
    const { container } = render(<ChatMarkdown text={'<img src=x onerror="alert(1)"><script>alert(2)</script> **<b>bold</b>**'} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(container.querySelector("strong")?.textContent).toBe("<b>bold</b>");
  });

  it("opens links in a new tab with noopener noreferrer, and never a javascript: one", () => {
    const { container } = render(<ChatMarkdown text="[ok](https://example.com) [bad](javascript:alert(1)) https://x.example" />);
    const links = [...container.querySelectorAll("a")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["https://example.com", "https://x.example"]);
    for (const a of links) {
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    }
    expect(container.textContent).toContain("bad");
  });

  it("draws mentions as a chip, and line breaks as <br>", () => {
    const { container } = render(<ChatMarkdown text={`hey @[Sam](user:${UUID})\nthere`} me={UUID} />);
    const chip = container.querySelector(`[data-mention="${UUID}"]`);
    expect(chip?.textContent).toBe("@Sam");
    expect(container.querySelectorAll("br")).toHaveLength(1);
  });
});
