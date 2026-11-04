// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=123-277
// source=packages/forms-native/src/renderers/scale.tsx
// component=ConsentField
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<ConsentField {...fieldProps} />`,
  imports: ['import { ConsentField } from "@marktiderman/genesis-forms-native"'],
  id: 'forms-native-consent-field',
  metadata: { nestable: true },
}
