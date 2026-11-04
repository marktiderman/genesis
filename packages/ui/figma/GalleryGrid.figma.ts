// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=73-767
// source=packages/ui/src/components/patterns/gallery-grid.tsx
// component=GalleryGrid
import figma from 'figma'
const instance = figma.selectedInstance

const layout = instance.getEnum('layout', { justified: 'justified', grid: 'grid' })
// rowHeight is the justified target height; the grid sizes its tiles from `columns`.
const rowHeight = instance.getEnum('rowHeight', { '110': 110, '120': 120, '150': 150, '160': 160 })

export default {
  example: figma.code`<GalleryGrid items={items} layout="${layout}"${layout === 'justified' ? figma.code` rowHeight={${rowHeight}}` : ''} />`,
  imports: ['import { GalleryGrid } from "@marktiderman/genesis-ui"'],
  id: 'gallery-grid',
  metadata: { nestable: true },
}
