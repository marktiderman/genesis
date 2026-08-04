import type { Meta, StoryObj } from "@storybook/react";
import { useEffect } from "react";
import { Button, Toaster, toast } from "@marktiderman/genesis-ui";

/**
 * Toast (sonner) stories. Each story fires the relevant toast on mount
 * so Chromatic baselines deterministically include the toast surface
 * — without this, the screenshot just captures the trigger button and
 * the toast UI is effectively untested.
 *
 * The button is kept for manual / interactive smoke-testing in
 * Storybook UI. Animation is held off via `duration: Infinity` so the
 * toast stays visible for the snapshot frame.
 */
const meta: Meta = {
  title: "UI/Toast",
};

export default meta;
type Story = StoryObj;

const STORY_TOAST_DURATION = Infinity;

export const Default: Story = {
  render: () => {
    useEffect(() => {
      const id = toast("Saved.", { duration: STORY_TOAST_DURATION });
      return () => {
        toast.dismiss(id);
      };
    }, []);
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <Button onClick={() => toast("Saved.")}>Show default toast</Button>
        <Toaster />
      </div>
    );
  },
};

export const Variants: Story = {
  render: () => {
    useEffect(() => {
      const ids = [
        toast.success("Item created.", { duration: STORY_TOAST_DURATION }),
        toast.error("Failed to save.", { duration: STORY_TOAST_DURATION }),
        toast.warning("Heads up.", { duration: STORY_TOAST_DURATION }),
        toast.info("Just so you know…", { duration: STORY_TOAST_DURATION }),
      ];
      return () => ids.forEach((id) => toast.dismiss(id));
    }, []);
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <Button onClick={() => toast.success("Item created.")}>Success</Button>
        <Button onClick={() => toast.error("Failed to save.")}>Error</Button>
        <Button onClick={() => toast.warning("Heads up.")}>Warning</Button>
        <Button onClick={() => toast.info("Just so you know…")}>Info</Button>
        <Toaster />
      </div>
    );
  },
};
