import type { Meta, StoryObj } from "@storybook/react";
import { Slider } from "@marktiderman/genesis-ui";

const meta: Meta<typeof Slider> = {
  title: "UI/Slider",
  component: Slider,
  parameters: { layout: "centered" },
};
export default meta;
type Story = StoryObj<typeof Slider>;

export const Default: Story = {
  render: () => <Slider defaultValue={[50]} max={100} step={1} style={{ width: 280 }} />,
};

export const Range: Story = {
  render: () => (
    <Slider defaultValue={[20, 80]} max={100} step={1} style={{ width: 280 }} />
  ),
};

export const StepLarge: Story = {
  render: () => (
    <Slider defaultValue={[50]} max={100} step={10} style={{ width: 280 }} />
  ),
};
