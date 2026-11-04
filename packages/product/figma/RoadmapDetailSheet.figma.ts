// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=115-3191
// source=packages/product/src/native/roadmap.tsx
// component=RoadmapDetailSheet
import figma from 'figma'

export default {
  example: figma.code`<RoadmapDetailSheet item={selected} onClose={close} copy={copy} />`,
  imports: ['import { RoadmapDetailSheet } from "@marktiderman/genesis-product/native"'],
  id: 'product-roadmap-detail-sheet',
  metadata: { nestable: false },
}
