// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=121-29
// source=packages/forms-native/src/slots.tsx
// component=DefaultProgress
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<DefaultProgress step={step} total={total} />`,
  imports: ['import { DefaultProgress } from "@marktiderman/genesis-forms-native"'],
  id: 'forms-native-default-progress',
  metadata: { nestable: true },
}
