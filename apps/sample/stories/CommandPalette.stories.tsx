import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { CommandPalette, useCommandPaletteHotkey, Button } from "@marktiderman/genesis-ui";

const meta: Meta<typeof CommandPalette> = {
  title: "UI/CommandPalette",
  component: CommandPalette,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof CommandPalette>;

/**
 * A thin action registry over `Command` — register flat commands, get
 * Cmd/Ctrl+K for free via `useCommandPaletteHotkey`.
 */
export const Default: Story = {
  render: () => {
    function Demo() {
      const [open, setOpen] = useCommandPaletteHotkey();
      const [lastAction, setLastAction] = useState<string | null>(null);
      return (
        <div className="flex min-h-[280px] flex-col items-center justify-center gap-3">
          <Button variant="outline" onClick={() => setOpen(true)}>
            Open command palette (⌘K)
          </Button>
          {lastAction ? (
            <p className="text-sm text-muted-foreground">Last action: {lastAction}</p>
          ) : null}
          <CommandPalette
            open={open}
            onOpenChange={setOpen}
            commands={[
              { id: "dashboard", label: "Go to Dashboard", group: "Navigate", onSelect: () => setLastAction("Go to Dashboard") },
              { id: "items", label: "Go to Items", group: "Navigate", onSelect: () => setLastAction("Go to Items") },
              { id: "new-item", label: "New item", shortcut: "⌘N", group: "Actions", onSelect: () => setLastAction("New item") },
              { id: "toggle-theme", label: "Toggle theme", group: "Actions", onSelect: () => setLastAction("Toggle theme") },
            ]}
          />
        </div>
      );
    }
    return <Demo />;
  },
};
