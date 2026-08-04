import type { Meta, StoryObj } from "@storybook/react";
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@marktiderman/genesis-ui";

const meta: Meta<typeof HoverCard> = {
  title: "UI/HoverCard",
  component: HoverCard,
};
export default meta;
type Story = StoryObj<typeof HoverCard>;

export const Default: Story = {
  render: () => (
    <HoverCard>
      <HoverCardTrigger asChild>
        <a href="https://genesis.tiderman.ventures" className="underline">
          @genesis
        </a>
      </HoverCardTrigger>
      <HoverCardContent className="w-80">
        <div style={{ display: "flex", gap: 12 }}>
          <Avatar>
            <AvatarImage src="" />
            <AvatarFallback>GN</AvatarFallback>
          </Avatar>
          <div>
            <h4 className="font-semibold">@genesis</h4>
            <p className="text-sm text-muted-foreground">
              Brand-agnostic design system for Tiderman Ventures.
            </p>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  ),
};
