import type { Meta, StoryObj } from "@storybook/react";
import { StatusBadge } from "@marktiderman/genesis-ui";

const STATUSES = [
  "onTrack",
  "atRisk",
  "offTrack",
  "done",
  "blocked",
  "inProgress",
] as const;

const LABELS: Record<(typeof STATUSES)[number], string> = {
  onTrack: "On Track",
  atRisk: "At Risk",
  offTrack: "Off Track",
  done: "Done",
  blocked: "Blocked",
  inProgress: "In Progress",
};

const meta: Meta<typeof StatusBadge> = {
  title: "UI/StatusBadge",
  component: StatusBadge,
  args: { children: "On Track", status: "onTrack" },
  argTypes: {
    status: {
      control: { type: "select" },
      options: STATUSES,
    },
  },
};

export default meta;
type Story = StoryObj<typeof StatusBadge>;

export const OnTrack: Story = { args: { status: "onTrack", children: LABELS.onTrack } };
export const AtRisk: Story = { args: { status: "atRisk", children: LABELS.atRisk } };
export const OffTrack: Story = { args: { status: "offTrack", children: LABELS.offTrack } };
export const Done: Story = { args: { status: "done", children: LABELS.done } };
export const Blocked: Story = { args: { status: "blocked", children: LABELS.blocked } };
export const InProgress: Story = { args: { status: "inProgress", children: LABELS.inProgress } };

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {STATUSES.map((s) => (
        <StatusBadge key={s} status={s}>
          {LABELS[s]}
        </StatusBadge>
      ))}
    </div>
  ),
};
