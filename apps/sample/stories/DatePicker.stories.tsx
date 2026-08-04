import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { DatePicker } from "@marktiderman/genesis-ui";

const meta: Meta<typeof DatePicker> = {
  title: "UI/DatePicker",
  component: DatePicker,
};
export default meta;
type Story = StoryObj<typeof DatePicker>;

export const Default: Story = {
  render: () => {
    function Demo() {
      const [date, setDate] = useState<Date | undefined>();
      return <DatePicker value={date} onChange={setDate} />;
    }
    return <Demo />;
  },
};

export const Preset: Story = {
  render: () => {
    function Demo() {
      const [date, setDate] = useState<Date | undefined>(new Date(2026, 3, 15));
      return <DatePicker value={date} onChange={setDate} />;
    }
    return <Demo />;
  },
};
