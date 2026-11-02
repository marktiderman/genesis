// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=6-80
// source=packages/ui-native/src/components/separator.tsx
// component=NativeSeparator
import figma from 'figma'
const instance = figma.selectedInstance

const orientation = instance.getEnum('orientation', { horizontal: 'horizontal', vertical: 'vertical' })

export default {
  example: figma.code`<NativeSeparator orientation="${orientation}" />`,
  imports: ['import { NativeSeparator } from "@marktiderman/genesis-ui-native"'],
  id: 'native-separator',
  metadata: { nestable: true },
}
