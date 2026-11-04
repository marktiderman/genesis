// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=123-353
// source=packages/forms-native/src/renderers/photo.tsx
// component=PhotoField
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<PhotoField {...fieldProps} />`,
  imports: ['import { PhotoField } from "@marktiderman/genesis-forms-native"'],
  id: 'forms-native-photo-field',
  metadata: { nestable: true },
}
