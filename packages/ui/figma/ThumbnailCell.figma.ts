// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=72-382
// source=packages/ui/src/components/data/DataTable.tsx
// component=ThumbnailCell
import figma from 'figma'
const instance = figma.selectedInstance

const label = instance.getString('Label')
const showImage = instance.getBoolean('Show image')

export default {
  example: figma.code`<ThumbnailCell${showImage ? ' src={imageUrl}' : ''} alt="${label}" />`,
  imports: ['import { ThumbnailCell } from "@marktiderman/genesis-ui/data"'],
  id: 'thumbnail-cell',
  metadata: { nestable: true },
}
