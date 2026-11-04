// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=121-76
// source=packages/forms-native/src/slots.tsx
// component=DefaultNotice
import figma from 'figma'
const instance = figma.selectedInstance
const kind = instance.getEnum('kind', { "restored": "restored", "discarded": "discarded", "draftError": "draftError", "saving": "saving" })
const message = instance.getString('Message')
export default {
  example: figma.code`<DefaultNotice kind="${kind}" message="${message}" />`,
  imports: ['import { DefaultNotice } from "@marktiderman/genesis-forms-native"'],
  id: 'forms-native-default-notice',
  metadata: { nestable: true },
}
