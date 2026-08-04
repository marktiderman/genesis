import type { Meta, StoryObj } from "@storybook/react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@marktiderman/genesis-ui";

const meta: Meta<typeof ResizablePanelGroup> = {
  title: "UI/Resizable",
  component: ResizablePanelGroup,
};
export default meta;
type Story = StoryObj<typeof ResizablePanelGroup>;

export const Default: Story = {
  render: () => (
    <ResizablePanelGroup
      direction="horizontal"
      className="h-48 w-96 rounded-lg border"
    >
      <ResizablePanel defaultSize={35}>
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Sidebar
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={65}>
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Content
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  ),
};
