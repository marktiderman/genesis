// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=71-214
// source=packages/ui/src/components/ui/aspect-ratio.tsx
// component=AspectRatio
import figma from 'figma'
const instance = figma.selectedInstance

const ratio = instance.getEnum('ratio', { '16:9': '16 / 9', '4:3': '4 / 3', '1:1': '1' })

export default {
  example: figma.code`<AspectRatio ratio={${ratio}}>{children}</AspectRatio>`,
  imports: ['import { AspectRatio } from "@marktiderman/genesis-ui"'],
  id: 'aspect-ratio',
  metadata: { nestable: true },
}
