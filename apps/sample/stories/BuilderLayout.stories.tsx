import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { BuilderLayout } from "@marktiderman/genesis-ui";

/**
 * BuilderLayout at four widths. Each story draws the builder in a frame of
 * that width: the columns follow a container query, so the frame (not the
 * window) decides them, and each play function measures the real columns
 * in the browser.
 */

const STEPS = [
  { id: "s1", title: "Welcome", body: "Say hello and set expectations." },
  { id: "s2", title: "Your goals", body: "Ask what they want from the next eight weeks." },
  { id: "s3", title: "Check-in time", body: "Pick a day and time for the weekly call." },
];

function Demo({ width }: { width: number }) {
  const [selected, setSelected] = useState(STEPS[0]!.id);
  const step = STEPS.find((s) => s.id === selected)!;
  return (
    <div style={{ width }} className="bg-background p-4" data-testid="frame">
      <BuilderLayout
        sticky
        outlineLabel="Outline"
        outline={
          <ul className="space-y-2">
            {STEPS.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  aria-current={s.id === selected ? "true" : undefined}
                  className="w-full rounded-lg border bg-card px-3 py-2 text-left text-sm aria-[current]:border-primary"
                  onClick={() => setSelected(s.id)}
                >
                  {s.title}
                </button>
              </li>
            ))}
          </ul>
        }
        // Keyed by the step: the editor is remade for each one, the preview is not.
        editor={<StepEditor key={step.id} title={step.title} body={step.body} />}
        previewLabel="Preview"
        preview={<LivePreview />}
      />
    </div>
  );
}

function StepEditor({ title, body }: { title: string; body: string }) {
  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <h2 className="text-base font-semibold">{title}</h2>
      <textarea aria-label="Step text" defaultValue={body} className="min-h-32 w-full rounded-md border bg-background p-2 text-sm" />
    </div>
  );
}

function LivePreview() {
  const [name, setName] = useState("");
  return (
    <div className="space-y-2 rounded-lg border bg-muted/40 p-4 text-sm">
      <p className="font-medium">Live preview</p>
      <label className="block space-y-1">
        <span>Your name</span>
        <input aria-label="Your name" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border bg-background px-2 py-1" />
      </label>
    </div>
  );
}

const meta: Meta<typeof Demo> = {
  title: "Layout/BuilderLayout",
  component: Demo,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof Demo>;

const box = (canvas: HTMLElement, slot: string) =>
  canvas.querySelector(`[data-slot="builder-layout-${slot}"]`)!.getBoundingClientRect();

/** 1440: three columns, the wide side columns (16rem and 24.5rem). */
export const Wide: Story = {
  name: "1440",
  args: { width: 1440 },
  play: async ({ canvasElement }) => {
    const outline = box(canvasElement, "outline");
    const editor = box(canvasElement, "editor");
    const preview = box(canvasElement, "preview");
    await expect(outline.width).toBeCloseTo(256, 0);
    await expect(preview.width).toBeCloseTo(392, 0);
    await expect(editor.left).toBeGreaterThan(outline.right);
    await expect(preview.left).toBeGreaterThan(editor.right);
    await expect(preview.top).toBeCloseTo(editor.top, 0);
  },
};

/** 1024: still three columns, the narrow side columns (13rem and 20rem). */
export const Laptop: Story = {
  name: "1024",
  args: { width: 1024 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const outline = box(canvasElement, "outline");
    const editor = box(canvasElement, "editor");
    const preview = box(canvasElement, "preview");
    await expect(outline.width).toBeCloseTo(208, 0);
    await expect(preview.width).toBeCloseTo(320, 0);
    await expect(preview.left).toBeGreaterThan(editor.right);
    // The preview keeps its state when the editor is remade for another step.
    const input = canvas.getByLabelText("Your name") as HTMLInputElement;
    await userEvent.type(input, "Sam");
    await userEvent.click(canvas.getByRole("button", { name: "Your goals" }));
    await expect(canvas.getByRole("heading", { name: "Your goals" })).toBeTruthy();
    await expect(canvas.getByLabelText("Your name")).toBe(input);
    await expect(input.value).toBe("Sam");
  },
};

/** 768: outline beside the editor, the preview under both. */
export const Tablet: Story = {
  name: "768",
  args: { width: 768 },
  play: async ({ canvasElement }) => {
    const outline = box(canvasElement, "outline");
    const editor = box(canvasElement, "editor");
    const preview = box(canvasElement, "preview");
    await expect(outline.width).toBeCloseTo(208, 0);
    await expect(editor.left).toBeGreaterThan(outline.right);
    await expect(preview.top).toBeGreaterThan(editor.bottom);
    await expect(preview.left).toBeCloseTo(outline.left, 0);
    await expect(preview.right).toBeCloseTo(editor.right, 0);
  },
};

/** 375: everything stacks, and nothing scrolls sideways. */
export const Phone: Story = {
  name: "375",
  args: { width: 375 },
  play: async ({ canvasElement }) => {
    const outline = box(canvasElement, "outline");
    const editor = box(canvasElement, "editor");
    const preview = box(canvasElement, "preview");
    await expect(editor.top).toBeGreaterThan(outline.bottom);
    await expect(preview.top).toBeGreaterThan(editor.bottom);
    await expect(editor.left).toBeCloseTo(outline.left, 0);
    const frame = canvasElement.querySelector<HTMLElement>('[data-testid="frame"]')!;
    await expect(frame.scrollWidth).toBeLessThanOrEqual(frame.clientWidth);
  },
};
