// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=73-767
// source=packages/ui/src/components/patterns/gallery-grid.tsx
// component=GalleryGrid
import figma from 'figma'
const instance = figma.selectedInstance

const layout = instance.getEnum('layout', { justified: 'justified', grid: 'grid' })

export default {
  example: figma.code`<GalleryGrid items={items} layout="${layout}" />`,
  imports: ['import { GalleryGrid } from "@marktiderman/genesis-ui"'],
  id: 'gallery-grid',
  metadata: { nestable: true },
}
