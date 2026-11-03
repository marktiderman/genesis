import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within, screen } from "storybook/test";
import { DataWriteError, writeConflict, type WriteConflict } from "@marktiderman/genesis-core";
import { ConflictSheet } from "@marktiderman/genesis-ui/data";
import { Button } from "@marktiderman/genesis-ui";

/** What a save met: someone else retitled the task and moved its due date first. */
const conflict = writeConflict(
  new DataWriteError("conflict", "Someone else changed this task after you opened it.", {
    current: { id: "t1", title: "Send the Acme proposal", due: "2026-11-12", done: false },
    currentVersion: "8",
  }),
  { title: "Send the proposal to Acme", due: "2026-11-10", done: false },
)!;

const meta: Meta<typeof ConflictSheet> = {
  title: "Data/ConflictSheet",
  component: ConflictSheet,
};
export default meta;
type Story = StoryObj<typeof ConflictSheet>;

function Demo({ start }: { start: WriteConflict | null }) {
  const [shown, setShown] = useState<WriteConflict | null>(start);
  const [said, setSaid] = useState("");
  return (
    <div className="space-y-3">
      <Button onClick={() => setShown(conflict)}>Save the task</Button>
      <p data-testid="conflict-choice">{said}</p>
      <ConflictSheet
        conflict={shown}
        noun="task"
        onKeepMine={async () => {
          await new Promise((r) => setTimeout(r, 400));
          setSaid(`Saved yours at version ${conflict.currentVersion}.`);
          setShown(null);
        }}
        onTakeTheirs={() => {
          setSaid("Showing theirs.");
          setShown(null);
        }}
        onDismiss={() => setShown(null)}
      />
    </div>
  );
}

export const Default: Story = {
  render: () => <Demo start={conflict} />,
  play: async ({ canvasElement }) => {
    const sheet = await screen.findByTestId("conflict-sheet");
    // Only the fields that differ, theirs first.
    await expect(within(sheet).getByTestId("conflict-sheet-field-title")).toBeInTheDocument();
    await expect(within(sheet).queryByTestId("conflict-sheet-field-done")).toBeNull();
    await userEvent.click(within(sheet).getByTestId("conflict-sheet-take-theirs"));
    await expect(within(canvasElement).getByTestId("conflict-choice")).toHaveTextContent("Showing theirs.");
  },
};

export const NothingToChoose: Story = {
  render: () => <Demo start={{ ...conflict, fields: [] }} />,
};
