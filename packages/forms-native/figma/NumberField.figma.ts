// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=123-54
// source=packages/forms-native/src/renderers/text.tsx
// component=NumberField
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<NumberField {...fieldProps} />`,
  imports: ['import { NumberField } from "@marktiderman/genesis-forms-native"'],
  id: 'forms-native-number-field',
  metadata: { nestable: true },
}
