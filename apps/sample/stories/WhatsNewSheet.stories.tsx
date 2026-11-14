import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, WhatsNewSheet, type WhatsNewNote } from "@marktiderman/genesis-ui";

const meta: Meta<typeof WhatsNewSheet> = { title: "Foundation/UI/WhatsNewSheet", component: WhatsNewSheet };
export default meta;
type Story = StoryObj<typeof WhatsNewSheet>;

const NOTES: WhatsNewNote[] = [
  { key: "dark", title: "Dark mode", body: "Settings, Appearance, Dark.", url: "https://acme.test/notes/dark" },
  { key: "waitlist", title: "Waitlists", body: "Join a full class and get a place when one opens." },
];

export const AfterAnUpdate: Story = {
  render: () => {
    const [notes, setNotes] = useState<WhatsNewNote[]>(NOTES);
    return (
      <>
        <Button onClick={() => setNotes(NOTES)}>Show again</Button>
        <WhatsNewSheet notes={notes} dismiss={() => setNotes([])} onOpenNote={() => {}} />
      </>
    );
  },
};
