import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import {
  Toolbar,
  ToolbarButton,
  ToolbarSeparator,
  ToolbarToggleGroup,
  ToolbarToggleItem,
} from "@marktiderman/genesis-ui";
import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight } from "lucide-react";

const meta: Meta<typeof Toolbar> = {
  title: "UI/Toolbar",
  component: Toolbar,
};
export default meta;
type Story = StoryObj<typeof Toolbar>;

export const Default: Story = {
  render: () => {
    function Demo() {
      const [marks, setMarks] = useState<string[]>(["bold"]);
      const [align, setAlign] = useState("left");
      return (
        <Toolbar aria-label="Text formatting">
          <ToolbarToggleGroup type="multiple" value={marks} onValueChange={setMarks}>
            <ToolbarToggleItem value="bold" aria-label="Bold">
              <Bold className="h-4 w-4" />
            </ToolbarToggleItem>
            <ToolbarToggleItem value="italic" aria-label="Italic">
              <Italic className="h-4 w-4" />
            </ToolbarToggleItem>
            <ToolbarToggleItem value="underline" aria-label="Underline">
              <Underline className="h-4 w-4" />
            </ToolbarToggleItem>
          </ToolbarToggleGroup>
          <ToolbarSeparator />
          <ToolbarToggleGroup type="single" value={align} onValueChange={(v) => v && setAlign(v)}>
            <ToolbarToggleItem value="left" aria-label="Align left">
              <AlignLeft className="h-4 w-4" />
            </ToolbarToggleItem>
            <ToolbarToggleItem value="center" aria-label="Align center">
              <AlignCenter className="h-4 w-4" />
            </ToolbarToggleItem>
            <ToolbarToggleItem value="right" aria-label="Align right">
              <AlignRight className="h-4 w-4" />
            </ToolbarToggleItem>
          </ToolbarToggleGroup>
          <ToolbarSeparator />
          <ToolbarButton>Clear</ToolbarButton>
        </Toolbar>
      );
    }
    return <Demo />;
  },
};
