// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=124-38
// source=packages/forms-web/src/Form.tsx
// component=DefaultEnding
import figma from 'figma'
const instance = figma.selectedInstance
const title = instance.getString('Title')
const description = instance.getString('Description')
export default {
  example: figma.code`<DefaultEnding title="${title}" description="${description}" />`,
  imports: ['import { DefaultEnding } from "@marktiderman/genesis-forms-web"'],
  id: 'forms-web-default-ending',
  metadata: { nestable: true },
}
