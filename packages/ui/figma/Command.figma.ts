// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=67-12
// source=packages/ui/src/components/ui/command.tsx
// component=Command
// Group 1 holds Items 1-3 and Group 2 holds Items 4-5 (the split the Figma set draws).
import figma from 'figma'
const instance = figma.selectedInstance

const placeholder = instance.getString('Placeholder')
const group1 = instance.getString('Group 1')
const group2 = instance.getString('Group 2')
const item1 = instance.getString('Item 1')
const item2 = instance.getString('Item 2')
const item3 = instance.getString('Item 3')
const item4 = instance.getString('Item 4')
const item5 = instance.getString('Item 5')

export default {
  example: figma.code`<Command>
  <CommandInput placeholder="${placeholder}" />
  <CommandList>
    <CommandGroup heading="${group1}">
      <CommandItem>${item1}</CommandItem>
      <CommandItem>${item2}</CommandItem>
      <CommandItem>${item3}</CommandItem>
    </CommandGroup>
    <CommandSeparator />
    <CommandGroup heading="${group2}">
      <CommandItem>${item4}</CommandItem>
      <CommandItem>${item5}</CommandItem>
    </CommandGroup>
  </CommandList>
</Command>`,
  imports: ['import { Command, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@marktiderman/genesis-ui"'],
  id: 'command',
  metadata: { nestable: true },
}
