// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=120-41
// source=packages/forms-native/src/renderers/text.tsx
// component=AnswerInput
import figma from 'figma'
const instance = figma.selectedInstance
const multiline = instance.getEnum('multiline', { false: false, true: true })
const state = instance.getEnum('state', { "default": "default", "focused": "focused", "invalid": "invalid" })
export default {
  example: figma.code`<AnswerInput {...props}${multiline ? ' multiline' : ''}${state === 'invalid' ? ' invalid' : ''} />`,
  imports: ['import { AnswerInput } from "@marktiderman/genesis-forms-native"'],
  id: 'forms-native-answer-input',
  metadata: { nestable: true },
}
