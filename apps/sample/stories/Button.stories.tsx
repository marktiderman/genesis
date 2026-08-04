import type { Meta, StoryObj } from "@storybook/react";
import { ArrowRight, Mail } from "lucide-react";
import { Button } from "@marktiderman/genesis-ui";

/**
 * Stories for `Button` from @marktiderman/genesis-ui.
 *
 * Each story renders a single deterministic state for Chromatic to
 * snapshot. PRD-07 Phase D-VR (DVR.4).
 */
const meta: Meta<typeof Button> = {
  title: "UI/Button",
  component: Button,
  args: { children: "Button" },
  argTypes: {
    variant: {
      control: { type: "select" },
      options: [
        "default",
        "secondary",
        "outline",
        "ghost",
        "destructive",
        "link",
      ],
    },
    size: {
      control: { type: "select" },
      options: ["default", "sm", "lg", "icon"],
    },
    disabled: { control: "boolean" },
    loading: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Default: Story = { args: { variant: "default" } };
export const Secondary: Story = { args: { variant: "secondary" } };
export const Outline: Story = { args: { variant: "outline" } };
export const Ghost: Story = { args: { variant: "ghost" } };
export const Destructive: Story = { args: { variant: "destructive" } };

export const Sizes: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Button size="sm">Small</Button>
      <Button>Medium</Button>
      <Button size="lg">Large</Button>
    </div>
  ),
};

export const Disabled: Story = { args: { disabled: true } };

/** `loading` renders the spinner, disables the button, and sets `aria-busy`. */
export const Loading: Story = { args: { loading: true, children: "Saving…" } };

/** Leading icon slot (replaced by the spinner while `loading`). */
export const WithStartIcon: Story = {
  args: { startIcon: <Mail />, children: "Email" },
};

/** Trailing icon slot (hidden while `loading`). */
export const WithEndIcon: Story = {
  args: { endIcon: <ArrowRight />, children: "Next" },
};

/**
 * `asChild` renders Button's classes onto its single child element via
 * Radix `Slot` instead of wrapping it in a `<button>` — compose Button's
 * styling onto an anchor (or a router `Link`) without an extra wrapper
 * node or nested-interactive-element issues.
 */
export const AsChild: Story = {
  render: () => (
    <Button asChild variant="outline" testID="button-as-child">
      <a href="https://github.com/marktiderman/genesis" target="_blank" rel="noreferrer">
        Visit repo
      </a>
    </Button>
  ),
};

/**
 * A disabled `asChild` Button. `disabled` is a button-only attribute that
 * anchors ignore entirely, so Button applies ARIA disabled semantics here
 * instead: `aria-disabled`, activation blocking, and the disabled styling
 * that `disabled:` utilities can't reach on a non-button element. Without
 * this the link would still navigate and would look fully enabled.
 */
export const AsChildDisabled: Story = {
  render: () => (
    <Button asChild variant="outline" disabled testID="button-as-child-disabled">
      <a href="https://github.com/marktiderman/genesis" target="_blank" rel="noreferrer">
        Can&apos;t visit repo
      </a>
    </Button>
  ),
};
