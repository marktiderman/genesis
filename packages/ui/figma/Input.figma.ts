// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=59-848
// source=packages/ui/src/components/ui/input.tsx
// component=Input
// The "focus" state is interaction, not a prop, so it is not emitted.
import figma from 'figma'
const instance = figma.selectedInstance

const state = instance.getEnum('state', { default: 'default', focus: 'focus', disabled: 'disabled', invalid: 'invalid' })
const value = instance.getString('Value')
const placeholder = instance.getString('Placeholder')
const showPlaceholder = instance.getBoolean('Show placeholder')

export default {
  example: figma.code`<Input${value ? figma.code` defaultValue="${value}"` : ''}${showPlaceholder ? figma.code` placeholder="${placeholder}"` : ''}${state === 'disabled' ? ' disabled' : ''}${state === 'invalid' ? ' aria-invalid' : ''} />`,
  imports: ['import { Input } from "@marktiderman/genesis-ui"'],
  id: 'input',
  metadata: { nestable: true },
}
