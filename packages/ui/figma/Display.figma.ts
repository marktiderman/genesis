// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=76-375
// source=packages/ui/src/components/layout/band.tsx
// component=Display
import figma from 'figma'
const instance = figma.selectedInstance

const size = instance.getEnum('size', { xl: 'xl', lg: 'lg', md: 'md', sm: 'sm' })
const text = instance.getString('Text')

export default {
  example: figma.code`<Display size="${size}">${text}</Display>`,
  imports: ['import { Display } from "@marktiderman/genesis-ui/layout"'],
  id: 'display',
  metadata: { nestable: true },
}
