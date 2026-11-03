// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=59-880
// source=packages/ui/src/components/ui/select.tsx
// component=Select
// The "open" state is interaction (the menu is showing), so it is not emitted; only "disabled" is a prop.
import figma from 'figma'
const instance = figma.selectedInstance

const state = instance.getEnum('state', { closed: 'closed', open: 'open', disabled: 'disabled' })
const value = instance.getString('Value')

export default {
  example: figma.code`<Select defaultValue="option-1"${state === 'disabled' ? ' disabled' : ''}>
  <SelectTrigger>
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="option-1">${value}</SelectItem>
  </SelectContent>
</Select>`,
  imports: ['import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@marktiderman/genesis-ui"'],
  id: 'select',
  metadata: { nestable: true },
}
