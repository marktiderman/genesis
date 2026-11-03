// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=72-391
// source=packages/ui/src/components/ui/visually-hidden.tsx
// component=VisuallyHidden
import figma from 'figma'
const instance = figma.selectedInstance

const text = instance.getString('Text')

export default {
  example: figma.code`<VisuallyHidden>${text}</VisuallyHidden>`,
  imports: ['import { VisuallyHidden } from "@marktiderman/genesis-ui"'],
  id: 'visually-hidden',
  metadata: { nestable: true },
}
