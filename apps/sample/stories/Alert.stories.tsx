import type { Meta, StoryObj } from "@storybook/react";
import { Alert, AlertTitle, AlertDescription } from "@marktiderman/genesis-ui";
import { AlertCircle, CheckCircle2, Info, Terminal } from "lucide-react";

const meta: Meta<typeof Alert> = {
  title: "UI/Alert",
  component: Alert,
  parameters: { layout: "padded" },
  argTypes: {
    variant: {
      control: { type: "select" },
      options: ["default", "destructive"],
    },
  },
};
export default meta;
type Story = StoryObj<typeof Alert>;

export const Default: Story = {
  render: (args) => (
    <Alert {...args}>
      <Terminal className="h-4 w-4" />
      <AlertTitle>Heads up!</AlertTitle>
      <AlertDescription>
        You can add components to your app using the cli.
      </AlertDescription>
    </Alert>
  ),
};

export const Destructive: Story = {
  args: { variant: "destructive" },
  render: (args) => (
    <Alert {...args}>
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Error</AlertTitle>
      <AlertDescription>
        Your session has expired. Please sign in again.
      </AlertDescription>
    </Alert>
  ),
};

export const WithoutIcon: Story = {
  render: () => (
    <Alert>
      <AlertTitle>Plain banner</AlertTitle>
      <AlertDescription>No leading icon — text-only state.</AlertDescription>
    </Alert>
  ),
};

export const Informational: Story = {
  render: () => (
    <Alert>
      <Info className="h-4 w-4" />
      <AlertTitle>Pull, never push</AlertTitle>
      <AlertDescription>
        Genesis ships breaking changes only at minor versions on 0.x.
      </AlertDescription>
    </Alert>
  ),
};

export const Success: Story = {
  render: () => (
    <Alert>
      <CheckCircle2 className="h-4 w-4" />
      <AlertTitle>Saved</AlertTitle>
      <AlertDescription>Your changes were saved successfully.</AlertDescription>
    </Alert>
  ),
};
