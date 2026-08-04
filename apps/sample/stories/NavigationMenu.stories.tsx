import type { Meta, StoryObj } from "@storybook/react";
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
  NavigationMenuLink,
} from "@marktiderman/genesis-ui";

const meta: Meta<typeof NavigationMenu> = {
  title: "UI/NavigationMenu",
  component: NavigationMenu,
};
export default meta;
type Story = StoryObj<typeof NavigationMenu>;

export const Default: Story = {
  render: () => (
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Products</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-64 gap-2 p-3">
              <li>
                <NavigationMenuLink className="block rounded-md p-2 text-sm hover:bg-accent">
                  Genesis UI
                </NavigationMenuLink>
              </li>
              <li>
                <NavigationMenuLink className="block rounded-md p-2 text-sm hover:bg-accent">
                  Genesis Core
                </NavigationMenuLink>
              </li>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink className="px-3 py-2 text-sm font-medium">
            Docs
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  ),
};
