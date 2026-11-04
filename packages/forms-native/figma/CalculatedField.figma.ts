// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=123-278
// source=packages/forms-native/src/renderers/scale.tsx
// component=CalculatedField
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<CalculatedField {...fieldProps} />`,
  imports: ['import { CalculatedField } from "@marktiderman/genesis-forms-native"'],
  id: 'forms-native-calculated-field',
  metadata: { nestable: true },
}
