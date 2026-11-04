// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=121-62
// source=packages/forms-native/src/slots.tsx
// component=DefaultErrorSummary
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<DefaultErrorSummary count={errors.length} errors={errors} onSelect={goTo} focusRef={focusRef} />`,
  imports: ['import { DefaultErrorSummary } from "@marktiderman/genesis-forms-native"'],
  id: 'forms-native-default-error-summary',
  metadata: { nestable: true },
}
