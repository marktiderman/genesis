import type { Meta, StoryObj } from "@storybook/react";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from "@marktiderman/genesis-ui";

const meta: Meta<typeof Command> = {
  title: "UI/Command",
  component: Command,
};
export default meta;
type Story = StoryObj<typeof Command>;

export const Default: Story = {
  render: () => (
    <Command className="w-72 rounded-lg border shadow-sm">
      <CommandInput placeholder="Search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Suggestions">
          <CommandItem>
            Dashboard <CommandShortcut>⌘D</CommandShortcut>
          </CommandItem>
          <CommandItem>Items</CommandItem>
          <CommandItem>Tasks</CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Settings">
          <CommandItem>Profile</CommandItem>
          <CommandItem>Preferences</CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
};
