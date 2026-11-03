// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=60-508
// source=packages/ui/src/components/ui/toggle-group.tsx
// component=ToggleGroup
import figma from 'figma'
const instance = figma.selectedInstance

const type = instance.getEnum('type', { single: 'single', multiple: 'multiple' })
const item1 = instance.getString('Item 1')
const item2 = instance.getString('Item 2')
const item3 = instance.getString('Item 3')

export default {
  example: figma.code`<ToggleGroup type="${type}">
  <ToggleGroupItem value="item-1">${item1}</ToggleGroupItem>
  <ToggleGroupItem value="item-2">${item2}</ToggleGroupItem>
  <ToggleGroupItem value="item-3">${item3}</ToggleGroupItem>
</ToggleGroup>`,
  imports: ['import { ToggleGroup, ToggleGroupItem } from "@marktiderman/genesis-ui"'],
  id: 'toggle-group',
  metadata: { nestable: true },
}
