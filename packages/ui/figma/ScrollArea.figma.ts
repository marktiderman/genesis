// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=71-112
// source=packages/ui/src/components/ui/scroll-area.tsx
// component=ScrollArea
import figma from 'figma'
const instance = figma.selectedInstance

const title = instance.getString('Title')

export default {
  example: figma.code`<ScrollArea>
  <H4>${title}</H4>
  {children}
</ScrollArea>`,
  imports: ['import { H4, ScrollArea } from "@marktiderman/genesis-ui"'],
  id: 'scroll-area',
  metadata: { nestable: true },
}
