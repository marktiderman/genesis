// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=123-247
// source=packages/forms-native/src/renderers/scale.tsx
// component=ScaleField
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<ScaleField {...fieldProps} />`,
  imports: ['import { ScaleField } from "@marktiderman/genesis-forms-native"'],
  id: 'forms-native-scale-field',
  metadata: { nestable: true },
}
