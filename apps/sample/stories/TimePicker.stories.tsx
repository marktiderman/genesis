import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { TimePicker } from "@marktiderman/genesis-ui";

const meta: Meta<typeof TimePicker> = { title: "Foundation/UI/TimePicker", component: TimePicker };
export default meta;
type Story = StoryObj<typeof TimePicker>;

export const Default: Story = {
  render: () => {
    const [at, setAt] = useState(() => new Date(2026, 5, 3, 9, 0));
    return <TimePicker aria-label="Class starts" value={at} onChange={setAt} minuteStep={30} />;
  },
};

export const TwentyFourHour: Story = {
  render: () => {
    const [at, setAt] = useState(() => new Date(2026, 5, 3, 18, 15));
    return <TimePicker aria-label="Reminder" value={at} onChange={setAt} hour12={false} />;
  },
};
