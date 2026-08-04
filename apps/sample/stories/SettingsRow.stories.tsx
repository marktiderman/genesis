import type { Meta, StoryObj } from "@storybook/react";
import { SettingsRow, Switch, Badge, Button } from "@marktiderman/genesis-ui";

const meta: Meta<typeof SettingsRow> = {
  title: "UI/SettingsRow",
  component: SettingsRow,
};
export default meta;
type Story = StoryObj<typeof SettingsRow>;

/**
 * Wiring a control by hand: `htmlFor` names it from the label and
 * `descriptionId` + `aria-describedby` make the supporting copy reachable
 * from the control. `ToggleRow` does both for you in the Switch case.
 */
export const WithSwitch: Story = {
  render: () => (
    <div className="w-96">
      <SettingsRow
        label="Two-factor authentication"
        description="Require a verification code at sign-in."
        htmlFor="settings-row-2fa"
        descriptionId="settings-row-2fa-description"
      >
        <Switch
          id="settings-row-2fa"
          aria-describedby="settings-row-2fa-description"
          defaultChecked
        />
      </SettingsRow>
    </div>
  ),
};

export const WithBadgeControl: Story = {
  render: () => (
    <div className="w-96">
      <SettingsRow label="Plan" description="Your current billing plan.">
        <Badge variant="secondary">Pro</Badge>
      </SettingsRow>
    </div>
  ),
};

export const WithButtonControl: Story = {
  render: () => (
    <div className="w-96">
      {/* A button names itself from its content, so no htmlFor — only the
          description needs wiring. */}
      <SettingsRow
        label="Password"
        description="Last changed 3 months ago."
        descriptionId="settings-row-password-description"
      >
        <Button
          variant="outline"
          size="sm"
          aria-describedby="settings-row-password-description"
          testID="settings-row-change-password"
        >
          Change
        </Button>
      </SettingsRow>
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div className="w-96">
      <SettingsRow
        label="Beta features"
        description="Not available on your current plan."
        htmlFor="settings-row-beta"
        descriptionId="settings-row-beta-description"
        disabled
      >
        <Switch
          id="settings-row-beta"
          aria-describedby="settings-row-beta-description"
          disabled
        />
      </SettingsRow>
    </div>
  ),
};

export const List: Story = {
  render: () => (
    <div className="w-96 divide-y divide-border rounded-lg border border-border px-4">
      <SettingsRow
        label="Email notifications"
        description="A daily summary every morning."
        htmlFor="settings-row-email"
        descriptionId="settings-row-email-description"
      >
        <Switch
          id="settings-row-email"
          aria-describedby="settings-row-email-description"
          defaultChecked
        />
      </SettingsRow>
      <SettingsRow
        label="Push notifications"
        description="Real-time alerts on this device."
        htmlFor="settings-row-push"
        descriptionId="settings-row-push-description"
      >
        <Switch
          id="settings-row-push"
          aria-describedby="settings-row-push-description"
        />
      </SettingsRow>
      <SettingsRow label="Plan" description="Your current billing plan.">
        <Badge variant="secondary">Pro</Badge>
      </SettingsRow>
    </div>
  ),
};
