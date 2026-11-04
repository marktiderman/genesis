// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=123-64
// source=packages/forms-native/src/renderers/text.tsx
// component=DateField
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<DateField {...fieldProps} />`,
  imports: ['import { DateField } from "@marktiderman/genesis-forms-native"'],
  id: 'forms-native-date-field',
  metadata: { nestable: true },
}
