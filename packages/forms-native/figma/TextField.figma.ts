// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=123-53
// source=packages/forms-native/src/renderers/text.tsx
// component=TextField
import figma from 'figma'
const instance = figma.selectedInstance
const multiline = instance.getEnum('multiline', { false: false, true: true })
export default {
  example: figma.code`<TextField {...fieldProps}${multiline ? ' multiline' : ''} />`,
  imports: ['import { TextField } from "@marktiderman/genesis-forms-native"'],
  id: 'forms-native-text-field',
  metadata: { nestable: true },
}
