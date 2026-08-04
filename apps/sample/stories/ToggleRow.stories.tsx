import type { Meta, StoryObj } from "@storybook/react";
import { ToggleRow } from "@marktiderman/genesis-ui";

const meta: Meta<typeof ToggleRow> = {
  title: "UI/ToggleRow",
  component: ToggleRow,
};
export default meta;
type Story = StoryObj<typeof ToggleRow>;

export const Default: Story = {
  render: () => (
    <div className="w-96">
      <ToggleRow
        label="Marketing emails"
        description="Receive occasional product news and tips."
      />
    </div>
  ),
};

export const Checked: Story = {
  render: () => (
    <div className="w-96">
      <ToggleRow
        label="Do not disturb"
        description="Silence notifications outside of working hours."
        defaultChecked
      />
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div className="w-96">
      <ToggleRow
        label="Beta features"
        description="Not available on your current plan."
        disabled
      />
    </div>
  ),
};

/**
 * `testID` selects the Switch itself (the node automation clicks);
 * `rowTestID` selects the surrounding row.
 */
export const WithTestSelectors: Story = {
  render: () => (
    <div className="w-96">
      <ToggleRow
        label="Two-factor authentication"
        description="Require a verification code at sign-in."
        testID="two-factor-switch"
        rowTestID="two-factor-row"
        defaultChecked
      />
    </div>
  ),
};

export const List: Story = {
  render: () => (
    <div className="w-96 divide-y divide-border rounded-lg border border-border px-4">
      <ToggleRow label="Email notifications" description="A daily summary every morning." defaultChecked />
      <ToggleRow label="Push notifications" description="Real-time alerts on this device." />
      <ToggleRow label="SMS alerts" description="Text messages for urgent updates." disabled />
    </div>
  ),
};
