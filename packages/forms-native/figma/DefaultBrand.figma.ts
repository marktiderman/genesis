// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=121-9
// source=packages/forms-native/src/slots.tsx
// component=DefaultBrand
import figma from 'figma'
const instance = figma.selectedInstance
const name = instance.getString('Name')
export default {
  example: figma.code`<DefaultBrand name={${JSON.stringify(name)}} />`,
  imports: ['import { DefaultBrand } from "@marktiderman/genesis-forms-native"'],
  id: 'forms-native-default-brand',
  metadata: { nestable: true },
}
