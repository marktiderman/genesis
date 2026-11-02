// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=6-84
// source=packages/ui-native/src/components/skeleton.tsx
// component=NativeSkeleton
import figma from 'figma'
const instance = figma.selectedInstance

const shape = instance.getEnum('shape', { rect: 'rect', circle: 'circle', text: 'text' })

let example
if (shape === 'circle') example = figma.code`<NativeSkeleton circle size={40} />`
else if (shape === 'text') example = figma.code`<NativeSkeleton width={160} height={14} />`
else example = figma.code`<NativeSkeleton width={240} height={80} />`

export default {
  example,
  imports: ['import { NativeSkeleton } from "@marktiderman/genesis-ui-native"'],
  id: 'native-skeleton',
  metadata: { nestable: true },
}
