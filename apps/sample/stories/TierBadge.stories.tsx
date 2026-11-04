import type { Meta, StoryObj } from "@storybook/react-vite";
import { TierBadge } from "@marktiderman/genesis-ui";
import { Star } from "lucide-react";
import type { CSSProperties } from "react";

// The tone names a key of the brand's `accents`; the story sets two so the
// tinted look shows without a brand that defines them.
const ACCENTS = {
  "--brand-accent-gold": "#d4a017",
  "--brand-accent-silver": "#8a94a6",
} as CSSProperties;

const meta: Meta<typeof TierBadge> = {
  title: "Foundation/UI/TierBadge",
  component: TierBadge,
  args: { label: "Gold", tone: "gold", size: "md" },
  argTypes: {
    tone: { control: { type: "select" }, options: [undefined, "gold", "silver"] },
    size: { control: { type: "inline-radio" }, options: ["sm", "md"] },
  },
  decorators: [(Story) => <div style={ACCENTS}><Story /></div>],
};

export default meta;
type Story = StoryObj<typeof TierBadge>;

export const Gold: Story = { args: { tone: "gold", label: "Gold", testID: "tier-badge-gold" } };
export const WithIcon: Story = { args: { tone: "gold", label: "Level 3", icon: <Star /> } };
export const Small: Story = { args: { tone: "silver", label: "Silver", size: "sm" } };
export const Neutral: Story = { args: { tone: undefined, label: "Member" } };
