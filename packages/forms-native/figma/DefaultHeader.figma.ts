// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=121-3
// source=packages/forms-native/src/slots.tsx
// component=DefaultHeader
import figma from 'figma'
const instance = figma.selectedInstance
const title = instance.getString('Title')
const description = instance.getString('Description')
const requiredNote = instance.getString('Required note')
export default {
  example: figma.code`<DefaultHeader title={${JSON.stringify(title)}} showTitle description={${JSON.stringify(description)}} requiredNote={${JSON.stringify(requiredNote)}} />`,
  imports: ['import { DefaultHeader } from "@marktiderman/genesis-forms-native"'],
  id: 'forms-native-default-header',
  metadata: { nestable: true },
}
