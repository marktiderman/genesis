// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=54-61
// source=packages/ui-native/src/components/gallery-grid.tsx
// component=NativeGalleryGrid
// The tiles in Figma are placeholders; `items` is the GalleryItem list from the data.
import figma from 'figma'
const instance = figma.selectedInstance

const layout = instance.getEnum('layout', { justified: 'justified', grid: 'grid' })

export default {
  example: figma.code`<NativeGalleryGrid items={items}${layout !== 'justified' ? figma.code` layout="${layout}" columns={3}` : ''} onItemPress={(item, index) => openLightbox(index)} />`,
  imports: ['import { NativeGalleryGrid } from "@marktiderman/genesis-ui-native"'],
  id: 'native-gallery-grid',
  metadata: { nestable: true },
}
