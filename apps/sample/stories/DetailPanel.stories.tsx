import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { DetailPanel } from "@marktiderman/genesis-ui/data";
import { Button } from "@marktiderman/genesis-ui";

const meta: Meta<typeof DetailPanel> = {
  title: "Data/DetailPanel",
  component: DetailPanel,
  parameters: { layout: "centered" },
};
export default meta;
type Story = StoryObj<typeof DetailPanel>;

interface Contact extends Record<string, unknown> {
  id: string;
  name: string;
  role: string;
  email: string;
  status: string;
}

const contact: Contact = {
  id: "1",
  name: "Priya Natarajan",
  role: "Head of Partnerships",
  email: "priya@example.com",
  status: "Active",
};

const fields = [
  { key: "role", label: "Role" },
  { key: "email", label: "Email" },
  { key: "status", label: "Status" },
];

/**
 * `"sheet"` (the default) — fixed, right-anchored slide-in panel, composed
 * from the shared `Sheet` primitive. This is the pre-`layout`-prop look.
 */
export const Sheet: Story = {
  render: () => {
    const [open, setOpen] = useState(true);
    return (
      <>
        <Button testID="detail-panel-story-sheet-trigger" onClick={() => setOpen(true)}>View contact</Button>
        <DetailPanel<Contact>
          layout="sheet"
          item={contact}
          open={open}
          onClose={() => setOpen(false)}
          title={contact.name}
          subtitle={contact.role}
          fields={fields}
          onEdit={() => setOpen(true)}
          onDelete={() => setOpen(false)}
          width="md"
        />
      </>
    );
  },
};

/**
 * `"dialog"` — centered modal overlay, composed from the shared `Dialog`
 * primitive. What `ResourcePage`'s `detail="modal"` now renders through.
 */
export const Dialog: Story = {
  render: () => {
    const [open, setOpen] = useState(true);
    return (
      <>
        <Button testID="detail-panel-story-dialog-trigger" onClick={() => setOpen(true)}>View contact</Button>
        <DetailPanel<Contact>
          layout="dialog"
          item={contact}
          open={open}
          onClose={() => setOpen(false)}
          title={contact.name}
          subtitle={contact.role}
          fields={fields}
          onEdit={() => setOpen(true)}
          onDelete={() => setOpen(false)}
          width="md"
        />
      </>
    );
  },
};

/**
 * `"inline"` — plain in-flow panel, no overlay/backdrop/fixed positioning.
 * For master-detail / split-pane layouts where the panel sits directly in
 * the page instead of floating above it.
 */
export const Inline: Story = {
  render: () => {
    const [open, setOpen] = useState(true);
    return (
      <div className="flex gap-4">
        <div className="flex w-64 flex-col gap-2 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          Master list goes here.
          <Button
            testID="detail-panel-story-inline-trigger"
            size="sm"
            variant="outline"
            onClick={() => setOpen(true)}
          >
            Select a contact
          </Button>
        </div>
        <DetailPanel<Contact>
          layout="inline"
          item={contact}
          open={open}
          onClose={() => setOpen(false)}
          title={contact.name}
          subtitle={contact.role}
          fields={fields}
          onEdit={() => setOpen(true)}
          onDelete={() => setOpen(false)}
          width="md"
        />
      </div>
    );
  },
};
