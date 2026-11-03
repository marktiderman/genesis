// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=67-148
// source=packages/ui/src/components/ui/navigation-menu.tsx
// component=NavigationMenu
// The state=closed|open property is an interaction state and is not emitted.
import figma from 'figma'
const instance = figma.selectedInstance

const item1 = instance.getString('Item 1')
const item2 = instance.getString('Item 2')
const item3 = instance.getString('Item 3')

export default {
  example: figma.code`<NavigationMenu>
  <NavigationMenuList>
    <NavigationMenuItem>
      <NavigationMenuTrigger>${item1}</NavigationMenuTrigger>
      <NavigationMenuContent>{item1Content}</NavigationMenuContent>
    </NavigationMenuItem>
    <NavigationMenuItem>
      <NavigationMenuTrigger>${item2}</NavigationMenuTrigger>
      <NavigationMenuContent>{item2Content}</NavigationMenuContent>
    </NavigationMenuItem>
    <NavigationMenuItem>
      <NavigationMenuTrigger>${item3}</NavigationMenuTrigger>
      <NavigationMenuContent>{item3Content}</NavigationMenuContent>
    </NavigationMenuItem>
  </NavigationMenuList>
</NavigationMenu>`,
  imports: ['import { NavigationMenu, NavigationMenuContent, NavigationMenuItem, NavigationMenuList, NavigationMenuTrigger } from "@marktiderman/genesis-ui"'],
  id: 'navigation-menu',
  metadata: { nestable: true },
}
