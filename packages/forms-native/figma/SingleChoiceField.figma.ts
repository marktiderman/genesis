// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=123-74
// source=packages/forms-native/src/renderers/choice.tsx
// component=SingleChoiceField
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<SingleChoiceField {...fieldProps} />`,
  imports: ['import { SingleChoiceField } from "@marktiderman/genesis-forms-native"'],
  id: 'forms-native-single-choice-field',
  metadata: { nestable: true },
}
