// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=123-101
// source=packages/forms-native/src/renderers/choice.tsx
// component=MultiChoiceField
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<MultiChoiceField {...fieldProps} />`,
  imports: ['import { MultiChoiceField } from "@marktiderman/genesis-forms-native"'],
  id: 'forms-native-multi-choice-field',
  metadata: { nestable: true },
}
