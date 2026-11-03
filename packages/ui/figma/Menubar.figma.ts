// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=67-116
// source=packages/ui/src/components/ui/menubar.tsx
// component=Menubar
// The state=closed|open property is an interaction state and is not emitted.
import figma from 'figma'
const instance = figma.selectedInstance

const menu1 = instance.getString('Menu 1')
const menu2 = instance.getString('Menu 2')
const menu3 = instance.getString('Menu 3')

export default {
  example: figma.code`<Menubar>
  <MenubarMenu>
    <MenubarTrigger>${menu1}</MenubarTrigger>
    <MenubarContent>{menu1Items}</MenubarContent>
  </MenubarMenu>
  <MenubarMenu>
    <MenubarTrigger>${menu2}</MenubarTrigger>
    <MenubarContent>{menu2Items}</MenubarContent>
  </MenubarMenu>
  <MenubarMenu>
    <MenubarTrigger>${menu3}</MenubarTrigger>
    <MenubarContent>{menu3Items}</MenubarContent>
  </MenubarMenu>
</Menubar>`,
  imports: ['import { Menubar, MenubarContent, MenubarItem, MenubarMenu, MenubarTrigger } from "@marktiderman/genesis-ui"'],
  id: 'menubar',
  metadata: { nestable: true },
}
