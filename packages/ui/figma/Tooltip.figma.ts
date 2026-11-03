// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=64-284
// source=packages/ui/src/components/ui/tooltip.tsx
// component=Tooltip
// Tooltip wraps its trigger: the child is whatever the tooltip describes.
import figma from 'figma'
const instance = figma.selectedInstance

const side = instance.getEnum('side', { top: 'top', bottom: 'bottom', left: 'left', right: 'right' })
const content = instance.getString('Content')

export default {
  example: figma.code`<Tooltip content="${content}" side="${side}">
  <Button variant="outline">Hover me</Button>
</Tooltip>`,
  imports: ['import { Button, Tooltip } from "@marktiderman/genesis-ui"'],
  id: 'tooltip',
  metadata: { nestable: false },
}
