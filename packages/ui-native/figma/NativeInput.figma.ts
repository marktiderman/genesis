// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=7-22
// source=packages/ui-native/src/components/input.tsx
// component=NativeInput
// "Value" is the placeholder text. The "state" variant maps to TextInput props where one
// exists (focused → autoFocus, disabled → editable={false}); "error" needs a message the
// design does not carry, so it is not emitted. NativeInput has no leading-icon prop.
import figma from 'figma'
const instance = figma.selectedInstance

const placeholder = instance.getString('Value')
const state = instance.getEnum('state', { default: 'default', focused: 'focused', error: 'error', disabled: 'disabled' })

export default {
  example: figma.code`<NativeInput placeholder="${placeholder}" value={value} onChangeText={setValue}${state === 'focused' ? ' autoFocus' : ''}${state === 'disabled' ? ' editable={false}' : ''} />`,
  imports: ['import { NativeInput } from "@marktiderman/genesis-ui-native"'],
  id: 'native-input',
  metadata: { nestable: true },
}
