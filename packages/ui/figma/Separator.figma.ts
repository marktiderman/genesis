// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=60-368
// source=packages/ui/src/components/ui/separator.tsx
// component=Separator
import figma from 'figma'
const instance = figma.selectedInstance

const orientation = instance.getEnum('orientation', { horizontal: 'horizontal', vertical: 'vertical' })

export default {
  example: figma.code`<Separator orientation="${orientation}" />`,
  imports: ['import { Separator } from "@marktiderman/genesis-ui"'],
  id: 'separator',
  metadata: { nestable: true },
}
