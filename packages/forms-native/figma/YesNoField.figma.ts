// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=123-168
// source=packages/forms-native/src/renderers/scale.tsx
// component=YesNoField
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<YesNoField {...fieldProps} />`,
  imports: ['import { YesNoField } from "@marktiderman/genesis-forms-native"'],
  id: 'forms-native-yes-no-field',
  metadata: { nestable: true },
}
