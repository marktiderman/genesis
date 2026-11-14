import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { RowContextMenuItems, RowMenuButton, type ResourceRowMenuItem } from "@marktiderman/genesis-ui/data";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@marktiderman/genesis-ui";

const items: ResourceRowMenuItem[] = [
  { key: "edit", label: "Edit", onSelect: () => undefined },
  { key: "archive", label: "Archive", onSelect: () => undefined, reason: "The default brand stays." },
  { key: "delete", label: "Delete", destructive: true, onSelect: () => undefined },
];

const meta: Meta<typeof RowMenuButton> = {
  title: "Foundation/Data/RowMenu",
  component: RowMenuButton,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof RowMenuButton>;

/**
 * A row's "More" menu (ADR 0017): a refused action stays in it, disabled, with the guard's reason
 * under its label, and the destructive one sits last.
 */
export const WithARefusal: Story = {
  render: () => <RowMenuButton items={items} label="Actions for Acme Rentals" testID="row-menu" />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Actions for Acme Rentals" }));
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByText("The default brand stays.")).toBeInTheDocument();
  },
};

/** The same items on right-click (RowContextMenuItems), as a table row offers them. */
export const OnRightClick: Story = {
  render: () => (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="rounded-md border p-6 text-sm">Right-click this row: Acme Rentals</div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <RowContextMenuItems items={items} />
      </ContextMenuContent>
    </ContextMenu>
  ),
};
