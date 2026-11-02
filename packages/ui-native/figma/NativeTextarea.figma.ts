// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=7-29
// source=packages/ui-native/src/components/textarea.tsx
// component=NativeTextarea
// "Value" is the placeholder text; "error" needs a message the design does not carry.
import figma from 'figma'
const instance = figma.selectedInstance

const placeholder = instance.getString('Value')
const state = instance.getEnum('state', { default: 'default', focused: 'focused', error: 'error' })

export default {
  example: figma.code`<NativeTextarea placeholder="${placeholder}" value={value} onChangeText={setValue}${state === 'focused' ? ' autoFocus' : ''} />`,
  imports: ['import { NativeTextarea } from "@marktiderman/genesis-ui-native"'],
  id: 'native-textarea',
  metadata: { nestable: true },
}
