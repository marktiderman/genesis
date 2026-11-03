// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=64-225
// source=packages/ui/src/components/ui/dropdown-menu.tsx
// component=DropdownMenu
// The "open" state is interaction (the menu is showing), so it is not emitted.
import figma from 'figma'
const instance = figma.selectedInstance

const state = instance.getEnum('state', { closed: 'closed', open: 'open' })
const trigger = instance.getString('Trigger label')
const item1 = instance.getString('Item 1')
const item2 = instance.getString('Item 2')
const item3 = instance.getString('Item 3')
const item4 = instance.getString('Item 4')

export default {
  example: figma.code`<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="outline">${trigger}</Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem onSelect={handleSelect}>${item1}</DropdownMenuItem>
    <DropdownMenuItem onSelect={handleSelect}>${item2}</DropdownMenuItem>
    <DropdownMenuItem onSelect={handleSelect}>${item3}</DropdownMenuItem>
    <DropdownMenuItem onSelect={handleSelect}>${item4}</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>`,
  imports: ['import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@marktiderman/genesis-ui"'],
  id: 'dropdown-menu',
  metadata: { nestable: false },
}
