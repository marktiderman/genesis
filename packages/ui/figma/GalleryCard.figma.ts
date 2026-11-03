// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=73-694
// source=packages/ui/src/components/patterns/gallery-card.tsx
// component=GalleryCard
import figma from 'figma'
const instance = figma.selectedInstance

const loading = instance.getEnum('loading', { false: 'false', true: 'true' })
const title = instance.getString('Title')
const subtitle = instance.getString('Subtitle')
const showCaption = instance.getBoolean('Show caption')

export default {
  example: figma.code`<GalleryCard
  src={src}
  alt={alt}${showCaption ? figma.code`
  title="${title}"
  subtitle="${subtitle}"` : ''}
  loading={${loading}}
/>`,
  imports: ['import { GalleryCard } from "@marktiderman/genesis-ui"'],
  id: 'gallery-card',
  metadata: { nestable: true },
}
