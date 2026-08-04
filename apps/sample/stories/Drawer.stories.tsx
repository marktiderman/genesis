import type { Meta, StoryObj } from "@storybook/react";
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerClose,
  Button,
} from "@marktiderman/genesis-ui";

const meta: Meta<typeof Drawer> = {
  title: "UI/Drawer",
  component: Drawer,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof Drawer>;

export const Default: Story = {
  render: () => (
    <div className="flex min-h-[280px] items-center justify-center">
      <Drawer>
        <DrawerTrigger asChild>
          <Button variant="outline">Open drawer</Button>
        </DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Move item</DrawerTitle>
            <DrawerDescription>
              Mobile-friendly bottom sheet, powered by vaul.
            </DrawerDescription>
          </DrawerHeader>
          <DrawerFooter>
            <Button>Confirm</Button>
            <DrawerClose asChild>
              <Button variant="outline">Cancel</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  ),
};
