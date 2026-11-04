// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=54-61
// source=packages/ui-native/src/components/gallery-grid.tsx
// component=NativeGalleryGrid
// The tiles are NativeGalleryGrid/Tile placeholders (`video` is a renderBadges badge); `items` is the GalleryItem list from the data.
import figma from 'figma'
const instance = figma.selectedInstance

const layout = instance.getEnum('layout', { justified: 'justified', grid: 'grid' })
// rowHeight is the justified target height; the grid sizes its tiles from `columns`.
const rowHeight = instance.getEnum('rowHeight', { '110': 110, '120': 120, '160': 160 })

export default {
  example: figma.code`<NativeGalleryGrid items={items}${layout !== 'justified' ? figma.code` layout="${layout}" columns={3}` : figma.code` rowHeight={${rowHeight}}`} onItemPress={(item, index) => openLightbox(index)} />`,
  imports: ['import { NativeGalleryGrid } from "@marktiderman/genesis-ui-native"'],
  id: 'native-gallery-grid',
  metadata: { nestable: true },
}
