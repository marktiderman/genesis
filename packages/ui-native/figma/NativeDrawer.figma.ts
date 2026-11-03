// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=40-54
// source=packages/ui-native/src/components/drawer.tsx
// component=NativeDrawer
// The Figma panel content (title and rows) is sample content, not a prop: children are whatever
// the screen puts in the drawer.
import figma from 'figma'
const instance = figma.selectedInstance

const side = instance.getEnum('side', { left: 'left', right: 'right' })

export default {
  example: figma.code`<NativeDrawer open={open} onOpenChange={setOpen}${side !== 'left' ? figma.code` side="${side}"` : ''}>
  {children}
</NativeDrawer>`,
  imports: ['import { NativeDrawer } from "@marktiderman/genesis-ui-native"'],
  id: 'native-drawer',
  metadata: { nestable: false },
}
