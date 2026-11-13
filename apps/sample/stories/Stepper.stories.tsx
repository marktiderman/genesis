import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stepper } from "@marktiderman/genesis-ui";

const meta: Meta<typeof Stepper> = { title: "Foundation/UI/Stepper", component: Stepper };
export default meta;
type Story = StoryObj<typeof Stepper>;

export const Checkout: Story = {
  render: () => (
    <div className="w-[32rem]">
      <Stepper current={1} steps={[{ label: "Account" }, { label: "Plan", description: "Pick one" }, { label: "Payment" }, { label: "Done" }]} />
    </div>
  ),
};
