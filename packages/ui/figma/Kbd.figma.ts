// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=67-11
// source=packages/ui/src/components/ui/kbd.tsx
// component=Kbd
import figma from 'figma'
const instance = figma.selectedInstance

const keys = instance.getString('Keys')

export default {
  example: figma.code`<Kbd>${keys}</Kbd>`,
  imports: ['import { Kbd } from "@marktiderman/genesis-ui"'],
  id: 'kbd',
  metadata: { nestable: true },
}
