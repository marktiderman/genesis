/**
 * RichTextEditor — the contract a consuming form relies on:
 *
 * - it mounts on the client and labels the editable area as a textbox;
 * - the toolbar is one Radix toolbar whose toggles reflect and change the
 *   document;
 * - `onChange` emits sanitized JSON plus derived HTML;
 * - controlled values are applied without echo loops;
 * - `readOnly` / `disabled` stop editing; `name` posts JSON with a form;
 * - links and embeds only accept safe URLs.
 */
import * as React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  RichTextEditor,
  type RichTextEditorHandle,
  type RichTextChangeDetails,
} from "../rich-text-editor";
import type { RichTextDoc } from "../rich-text-doc";

const hello: RichTextDoc = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Hello there" }] }],
};

async function mounted() {
  return waitFor(() => {
    const box = screen.getByRole("textbox", { name: "Lesson text" });
    expect(box.getAttribute("contenteditable")).toBeTruthy();
    return box;
  });
}

describe("RichTextEditor", () => {
  it("server-renders the content read-only, then mounts the editor", async () => {
    const html = renderToString(<RichTextEditor aria-label="Lesson text" defaultValue={hello} />);
    expect(html).toContain("Hello there");
    expect(html).not.toContain("contenteditable");

    render(<RichTextEditor aria-label="Lesson text" defaultValue={hello} />);
    const box = await mounted();
    expect(box.getAttribute("aria-multiline")).toBe("true");
    expect(box.textContent).toBe("Hello there");
    expect(screen.getByRole("toolbar", { name: "Formatting" })).toBeTruthy();
  });

  it("injects no <style> tag, so a strict style-src CSP is enough", async () => {
    render(<RichTextEditor aria-label="Lesson text" defaultValue={hello} />);
    const box = await mounted();
    expect(document.querySelector("style[data-tiptap-style]")).toBeNull();
    // Tiptap's base rules ride on the editable element instead.
    expect(box.className).toContain("whitespace-break-spaces");
  });

  it("toggles marks from the toolbar and emits sanitized JSON + HTML", async () => {
    const onChange = vi.fn<(doc: RichTextDoc, d: RichTextChangeDetails) => void>();
    const ref = React.createRef<RichTextEditorHandle>();
    render(<RichTextEditor ref={ref} aria-label="Lesson text" defaultValue={hello} onChange={onChange} />);
    await mounted();

    act(() => {
      ref.current!.editor!.commands.selectAll();
    });
    const bold = screen.getByRole("button", { name: "Bold" });
    expect(bold.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(bold);

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const [doc, details] = onChange.mock.lastCall!;
    expect(doc).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hello there", marks: [{ type: "bold" }] }] }],
    });
    expect(details.html).toBe("<p><strong>Hello there</strong></p>");
    expect(details.text).toBe("Hello there");
    expect(details.isEmpty).toBe(false);
    await waitFor(() => expect(screen.getByRole("button", { name: "Bold" }).getAttribute("aria-pressed")).toBe("true"));
  });

  it("applies a new controlled value and ignores its own echo", async () => {
    function Controlled() {
      const [value, setValue] = React.useState<RichTextDoc>(hello);
      return (
        <>
          <RichTextEditor aria-label="Lesson text" value={value} onChange={(d) => setValue(d)} />
          <button
            type="button"
            onClick={() =>
              setValue({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Reset" }] }] })
            }
          >
            reset
          </button>
        </>
      );
    }
    render(<Controlled />);
    const box = await mounted();
    fireEvent.click(screen.getByRole("button", { name: "reset" }));
    await waitFor(() => expect(box.textContent).toBe("Reset"));
  });

  it("parses an HTML value into the schema, dropping scripts and foreign iframes", async () => {
    const ref = React.createRef<RichTextEditorHandle>();
    render(
      <RichTextEditor
        ref={ref}
        aria-label="Lesson text"
        embeds
        defaultValue={
          '<p onclick="alert(1)">Hi <a href="javascript:alert(1)">bad</a> <a href="https://ok.example">ok</a></p>' +
          '<script>alert(1)</script><iframe src="https://evil.example"></iframe>' +
          '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>'
        }
      />,
    );
    await mounted();
    const html = ref.current!.getHTML();
    expect(html).not.toMatch(/<script|onclick|javascript:|evil\.example/i);
    expect(html).toContain('href="https://ok.example"');
    expect(html).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });

  it("readOnly hides the toolbar and stops editing; disabled disables it", async () => {
    const { rerender } = render(<RichTextEditor aria-label="Lesson text" defaultValue={hello} readOnly />);
    let box = await mounted();
    expect(box.getAttribute("contenteditable")).toBe("false");
    expect(box.getAttribute("aria-readonly")).toBe("true");
    expect(screen.queryByRole("toolbar")).toBeNull();

    rerender(<RichTextEditor aria-label="Lesson text" defaultValue={hello} disabled />);
    box = await mounted();
    expect(box.getAttribute("contenteditable")).toBe("false");
    expect(box.getAttribute("aria-disabled")).toBe("true");
    expect((screen.getByRole("button", { name: "Bold" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("posts the document as JSON through a hidden input when named", async () => {
    const { container } = render(<RichTextEditor aria-label="Lesson text" name="body" defaultValue={hello} />);
    await mounted();
    const input = container.querySelector('input[type="hidden"][name="body"]') as HTMLInputElement;
    expect(JSON.parse(input.value)).toEqual(hello);
  });

  it("is named by <label htmlFor> and an HTML defaultValue reaches the form value", async () => {
    const { container } = render(
      <>
        <label htmlFor="lesson-body">Lesson text</label>
        <RichTextEditor id="lesson-body" name="body" defaultValue="<p>Hi <em>there</em></p>" />
      </>,
    );
    const box = await mounted();
    expect(box.id).toBe("lesson-body");
    const input = container.querySelector('input[type="hidden"][name="body"]') as HTMLInputElement;
    await waitFor(() =>
      expect(JSON.parse(input.value)).toEqual({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Hi " }, { type: "text", text: "there", marks: [{ type: "italic" }] }] }],
      }),
    );
  });

  it("links: rejects unsafe URLs, applies safe ones", async () => {
    const ref = React.createRef<RichTextEditorHandle>();
    render(<RichTextEditor ref={ref} aria-label="Lesson text" defaultValue={hello} />);
    await mounted();
    act(() => {
      ref.current!.editor!.commands.selectAll();
    });
    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    const field = await screen.findByLabelText("Link address");

    fireEvent.change(field, { target: { value: "javascript:alert(1)" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(ref.current!.getHTML()).not.toContain("<a");

    fireEvent.change(field, { target: { value: "example.com/lesson" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(ref.current!.getHTML()).toContain('href="https://example.com/lesson"'));
  });

  it("embeds: only YouTube, Vimeo and Loom, and only when enabled", async () => {
    const ref = React.createRef<RichTextEditorHandle>();
    const { unmount } = render(<RichTextEditor ref={ref} aria-label="Lesson text" />);
    await mounted();
    expect(screen.queryByRole("button", { name: "Embed video" })).toBeNull();
    unmount();

    render(<RichTextEditor ref={ref} aria-label="Lesson text" embeds defaultValue={hello} />);
    await mounted();
    // Caret in the middle of a paragraph: the embed goes after it, not inside.
    act(() => {
      ref.current!.editor!.commands.setTextSelection(4);
    });
    fireEvent.click(screen.getByRole("button", { name: "Embed video" }));
    const field = await screen.findByLabelText("YouTube, Vimeo or Loom link");
    fireEvent.change(field, { target: { value: "https://evil.example/watch?v=dQw4w9WgXcQ" } });
    fireEvent.click(screen.getByRole("button", { name: "Insert" }));
    expect(await screen.findByRole("alert")).toBeTruthy();

    fireEvent.change(field, { target: { value: "https://vimeo.com/76979871" } });
    fireEvent.change(screen.getByLabelText("Title (read by screen readers)"), { target: { value: "Welcome" } });
    fireEvent.click(screen.getByRole("button", { name: "Insert" }));
    await waitFor(() =>
      expect(ref.current!.getJSON().content).toEqual([
        hello.content[0],
        { type: "videoEmbed", attrs: { provider: "vimeo", id: "76979871", title: "Welcome" } },
      ]),
    );
  });

  it("shows a character count tied to the textbox when maxLength is set", async () => {
    render(<RichTextEditor aria-label="Lesson text" defaultValue={hello} maxLength={100} />);
    const box = await mounted();
    const countId = box.getAttribute("aria-describedby")!;
    await waitFor(() => expect(document.getElementById(countId)!.textContent).toBe("11 / 100 characters"));
  });

  it("offers only the configured heading levels", async () => {
    render(<RichTextEditor aria-label="Lesson text" headingLevels={[3]} />);
    await mounted();
    expect(screen.queryByRole("button", { name: "Heading 2" })).toBeNull();
    expect(screen.getByRole("button", { name: "Heading 3" })).toBeTruthy();
  });
});
