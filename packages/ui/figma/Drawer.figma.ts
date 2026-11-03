// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=64-159
// source=packages/ui/src/components/ui/drawer.tsx
// component=Drawer
import figma from 'figma'
const instance = figma.selectedInstance

const title = instance.getString('Title')
const description = instance.getString('Description')

export default {
  example: figma.code`<Drawer open={open} onOpenChange={setOpen}>
  <DrawerContent>
    <DrawerHeader>
      <DrawerTitle>${title}</DrawerTitle>
      <DrawerDescription>${description}</DrawerDescription>
    </DrawerHeader>
  </DrawerContent>
</Drawer>`,
  imports: ['import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@marktiderman/genesis-ui"'],
  id: 'drawer',
  metadata: { nestable: false },
}
