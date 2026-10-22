import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { SortableList } from "@marktiderman/genesis-ui";

type Step = { id: string; name: string; detail: string };

const STEPS: Step[] = [
  { id: "w1", name: "Week 1 · Getting started", detail: "Clip · reading · checklist" },
  { id: "w2", name: "Week 2 · Planning ahead", detail: "Video · reading · action plan" },
  { id: "w3", name: "Week 3 · Review", detail: "Video · reading · quiz" },
];

function CourseSteps({ moveMenu = true }: { moveMenu?: boolean }) {
  const [items, setItems] = useState(STEPS);
  return (
    <div style={{ maxWidth: 460 }}>
      <SortableList<Step>
        label="Course steps"
        items={items}
        getKey={(s) => s.id}
        getItemLabel={(s) => s.name}
        moveMenu={moveMenu}
        onReorder={(from, to) =>
          setItems((current) => {
            const next = current.slice();
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved!);
            return next;
          })
        }
        renderItem={(s, { handle, moveDown }) => (
          <div className="flex items-center gap-2 rounded-md border border-border bg-card p-2">
            {handle}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{s.name}</div>
              <div className="text-xs text-muted-foreground">{s.detail}</div>
            </div>
            {!moveMenu && (
              <button type="button" className="text-xs underline" onClick={moveDown}>
                Move {s.name} down
              </button>
            )}
          </div>
        )}
      />
    </div>
  );
}

const meta: Meta<typeof CourseSteps> = {
  title: "Patterns/SortableList",
  component: CourseSteps,
};
export default meta;
type Story = StoryObj<typeof CourseSteps>;

export const Default: Story = {};

/**
 * In a real browser, moving a focused element drops focus to the body; the
 * list puts it back. A row's own button keeps focus after it moves the row.
 */
export const RowButtonKeepsFocus: Story = {
  args: { moveMenu: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const down = canvas.getByRole("button", { name: "Move Week 1 · Getting started down" });
    await userEvent.click(down);
    const names = canvas.getAllByRole("listitem").map((li) => li.getAttribute("data-sortable-key"));
    await expect(names).toEqual(["w2", "w1", "w3"]);
    await expect(document.activeElement).toBe(down);
  },
};

/** The keyboard path: Space picks up, an arrow moves, Space drops; focus stays on the handle. */
export const KeyboardMove: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const handle = canvas.getByRole("button", { name: "Reorder Week 1 · Getting started" });
    handle.focus();
    await userEvent.keyboard(" ");
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard(" ");
    const names = canvas.getAllByRole("listitem").map((li) => li.getAttribute("data-sortable-key"));
    await expect(names).toEqual(["w2", "w1", "w3"]);
    await expect(document.activeElement).toBe(handle);
    await expect(handle.getAttribute("data-grabbed")).toBeNull();
  },
};
