import type { Meta, StoryObj } from "@storybook/react";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  Button,
} from "@marktiderman/genesis-ui";

const meta: Meta<typeof Sheet> = { title: "UI/Sheet", component: Sheet };
export default meta;
type Story = StoryObj<typeof Sheet>;

const renderWithSide = (side: "top" | "right" | "bottom" | "left") => () => (
  <Sheet>
    <SheetTrigger asChild>
      <Button variant="outline">Open from {side}</Button>
    </SheetTrigger>
    <SheetContent side={side}>
      <SheetHeader>
        <SheetTitle>Edit profile</SheetTitle>
        <SheetDescription>
          Make changes here. Click save when done.
        </SheetDescription>
      </SheetHeader>
    </SheetContent>
  </Sheet>
);

export const Right: Story = { render: renderWithSide("right") };
export const Left: Story = { render: renderWithSide("left") };
export const Top: Story = { render: renderWithSide("top") };
export const Bottom: Story = { render: renderWithSide("bottom") };

// Alias so `/showcase/primitives/sheet` has a `ui-sheet--default` story.
export const Default = Right;
