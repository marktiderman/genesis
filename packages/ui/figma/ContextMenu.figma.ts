// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=67-164
// source=packages/ui/src/components/ui/context-menu.tsx
// component=ContextMenu
// The state=closed|open property is an interaction state and is not emitted.
import figma from 'figma'
const instance = figma.selectedInstance

const trigger = instance.getString('Trigger')
const item1 = instance.getString('Item 1')
const item2 = instance.getString('Item 2')
const item3 = instance.getString('Item 3')
const item4 = instance.getString('Item 4')

export default {
  example: figma.code`<ContextMenu>
  <ContextMenuTrigger>${trigger}</ContextMenuTrigger>
  <ContextMenuContent>
    <ContextMenuItem>${item1}</ContextMenuItem>
    <ContextMenuItem>${item2}</ContextMenuItem>
    <ContextMenuItem>${item3}</ContextMenuItem>
    <ContextMenuItem>${item4}</ContextMenuItem>
  </ContextMenuContent>
</ContextMenu>`,
  imports: ['import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@marktiderman/genesis-ui"'],
  id: 'context-menu',
  metadata: { nestable: true },
}
