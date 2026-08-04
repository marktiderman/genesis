import type { Meta, StoryObj } from "@storybook/react";
import {
  PasswordToggleField,
  PasswordToggleFieldInput,
  PasswordToggleFieldToggle,
  PasswordToggleFieldSlot,
} from "@marktiderman/genesis-ui";
import { Eye, EyeOff } from "lucide-react";

const meta: Meta<typeof PasswordToggleField> = {
  title: "UI/PasswordToggleField",
  component: PasswordToggleField,
};
export default meta;
type Story = StoryObj<typeof PasswordToggleField>;

/**
 * Wraps Radix's `unstable_PasswordToggleField` — keeps focus and caret
 * position across the show/hide toggle, and re-masks on submit/reset.
 * @stability Experimental — the underlying Radix package is pre-1.0.
 */
export const Default: Story = {
  render: () => (
    <PasswordToggleField className="w-64">
      <PasswordToggleFieldInput placeholder="Password" />
      <PasswordToggleFieldToggle>
        <PasswordToggleFieldSlot visible={<EyeOff />} hidden={<Eye />} />
      </PasswordToggleFieldToggle>
    </PasswordToggleField>
  ),
};
