// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=121-54
// source=packages/forms-native/src/slots.tsx
// component=DefaultEnding
import figma from 'figma'
const instance = figma.selectedInstance
const title = instance.getString('Title')
const description = instance.getString('Description')
export default {
  example: figma.code`<DefaultEnding title="${title}" description="${description}" focusRef={focusRef} />`,
  imports: ['import { DefaultEnding } from "@marktiderman/genesis-forms-native"'],
  id: 'forms-native-default-ending',
  metadata: { nestable: true },
}
