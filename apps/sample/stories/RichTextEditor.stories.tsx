import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { RichTextEditor } from "@marktiderman/genesis-ui/rich-text-editor";
import { RichText, type RichTextDoc } from "@marktiderman/genesis-ui/rich-text";

const LESSON: RichTextDoc = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Week 2 · Systems over goals" }] },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Goals set the direction; " },
        { type: "text", text: "systems", marks: [{ type: "bold" }] },
        { type: "text", text: " make the progress. Read " },
        {
          type: "text",
          text: "chapter one",
          marks: [{ type: "link", attrs: { href: "https://jamesclear.com/atomic-habits" } }],
        },
        { type: "text", text: " before the session." },
      ],
    },
    {
      type: "bulletList",
      content: [
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Pick one habit" }] }] },
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Make it obvious" }] }] },
      ],
    },
    {
      type: "blockquote",
      content: [{ type: "paragraph", content: [{ type: "text", text: "You fall to the level of your systems." }] }],
    },
  ],
};

function LessonEditor({
  initial = LESSON,
  embeds = true,
  readOnly = false,
  disabled = false,
  maxLength,
}: {
  initial?: RichTextDoc;
  embeds?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  maxLength?: number;
}) {
  const [doc, setDoc] = useState<RichTextDoc>(initial);
  const [html, setHtml] = useState("");
  return (
    <div style={{ maxWidth: 720 }} className="space-y-4">
      <RichTextEditor
        aria-label="Lesson text"
        value={doc}
        onChange={(next, details) => {
          setDoc(next);
          setHtml(details.html);
        }}
        placeholder="Write the lesson…"
        embeds={embeds}
        readOnly={readOnly}
        disabled={disabled}
        maxLength={maxLength}
        testID="lesson-editor"
      />
      <section aria-label="Preview" className="rounded-md border border-border p-4">
        <RichText value={doc} />
      </section>
      <output data-testid="lesson-html" className="block text-xs text-muted-foreground break-all">
        {html}
      </output>
    </div>
  );
}

const EMPTY: RichTextDoc = { type: "doc", content: [{ type: "paragraph" }] };

const meta: Meta<typeof LessonEditor> = {
  title: "Foundation/Patterns/RichTextEditor",
  component: LessonEditor,
};
export default meta;
type Story = StoryObj<typeof LessonEditor>;

export const Default: Story = {};

export const WithCharacterLimit: Story = { args: { maxLength: 2000, embeds: false } };

export const ReadOnly: Story = { args: { readOnly: true } };

export const Disabled: Story = { args: { disabled: true } };

/**
 * Toolbar path: turn Bold on from the toolbar, type, and the preview and the
 * sanitized HTML follow. Focus goes back to the text after the toggle.
 */
export const ToolbarFormatting: Story = {
  args: { embeds: false, initial: EMPTY },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const box = await canvas.findByRole("textbox", { name: "Lesson text" });
    await waitFor(() => expect(box.getAttribute("contenteditable")).toBe("true"));

    await userEvent.click(box);
    await userEvent.click(canvas.getByRole("button", { name: "Bold" }));
    await waitFor(() => expect(box.contains(document.activeElement) || document.activeElement === box).toBe(true));
    await userEvent.keyboard("Practice daily");

    await waitFor(() =>
      expect(canvas.getByTestId("lesson-html").textContent).toBe("<p><strong>Practice daily</strong></p>"),
    );
    await expect(canvas.getByRole("button", { name: "Bold" }).getAttribute("aria-pressed")).toBe("true");
    const preview = canvas.getByRole("region", { name: "Preview" });
    await expect(preview.querySelector("strong")?.textContent).toBe("Practice daily");
  },
};

/** A javascript: link is refused with an error; a bare host becomes https. */
export const SafeLinks: Story = {
  args: { embeds: false, initial: EMPTY },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const box = await canvas.findByRole("textbox", { name: "Lesson text" });
    await waitFor(() => expect(box.getAttribute("contenteditable")).toBe("true"));
    await userEvent.click(box);

    // With nothing selected, the link's address becomes its text.
    await userEvent.click(canvas.getByRole("button", { name: "Link" }));
    const body = within(canvasElement.ownerDocument.body);
    const field = await body.findByLabelText("Link address");
    await userEvent.type(field, "javascript:alert(1)");
    await userEvent.click(body.getByRole("button", { name: "Apply" }));
    await expect(await body.findByRole("alert")).toBeTruthy();

    await userEvent.clear(field);
    await userEvent.type(field, "example.com/lesson");
    await userEvent.click(body.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(canvas.getByTestId("lesson-html").textContent).toBe(
        '<p><a href="https://example.com/lesson" target="_blank" rel="noopener noreferrer nofollow">example.com/lesson</a></p>',
      ),
    );
  },
};
