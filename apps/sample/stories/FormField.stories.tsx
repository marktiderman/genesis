import type { Meta, StoryObj } from "@storybook/react";
import { FormField, FormLabel, FormDescription, FormError, Input } from "@marktiderman/genesis-ui";

const meta: Meta<typeof FormField> = {
  title: "UI/FormField",
  component: FormField,
};
export default meta;
type Story = StoryObj<typeof FormField>;

export const Default: Story = {
  render: () => (
    <FormField className="w-72">
      <FormLabel required>Email</FormLabel>
      <Input placeholder="jane@example.com" />
      <FormDescription>We&apos;ll never share your email.</FormDescription>
    </FormField>
  ),
};

export const WithError: Story = {
  render: () => (
    <FormField className="w-72">
      <FormLabel error required>
        Email
      </FormLabel>
      <Input placeholder="jane@example.com" aria-invalid />
      <FormError>Enter a valid email address.</FormError>
    </FormField>
  ),
};
