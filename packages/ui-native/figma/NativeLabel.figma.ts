// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=5-19
// source=packages/ui-native/src/components/label.tsx
// component=NativeLabel
// NativeLabel has no required-marker prop; the Figma "required" boolean is not emitted.
import figma from 'figma'
const instance = figma.selectedInstance

const text = instance.getString('Text')

export default {
  example: figma.code`<NativeLabel>${text}</NativeLabel>`,
  imports: ['import { NativeLabel } from "@marktiderman/genesis-ui-native"'],
  id: 'native-label',
  metadata: { nestable: true },
}
