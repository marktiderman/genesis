// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=59-855
// source=packages/ui/src/components/ui/textarea.tsx
// component=Textarea
// The "focus" state is interaction, not a prop, so it is not emitted.
import figma from 'figma'
const instance = figma.selectedInstance

const state = instance.getEnum('state', { default: 'default', focus: 'focus', disabled: 'disabled' })
const value = instance.getString('Value')

export default {
  example: figma.code`<Textarea${value ? figma.code` defaultValue="${value}"` : ''}${state === 'disabled' ? ' disabled' : ''} />`,
  imports: ['import { Textarea } from "@marktiderman/genesis-ui"'],
  id: 'textarea',
  metadata: { nestable: true },
}
