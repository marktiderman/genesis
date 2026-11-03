// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=72-375
// source=packages/ui/src/components/data/DataTable.tsx
// component=LinkCell
import figma from 'figma'
const instance = figma.selectedInstance

const label = instance.getString('Label')

export default {
  example: figma.code`<LinkCell href={href} label="${label}" />`,
  imports: ['import { LinkCell } from "@marktiderman/genesis-ui/data"'],
  id: 'link-cell',
  metadata: { nestable: true },
}
