// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=71-510
// source=packages/ui/src/components/patterns/rating.tsx
// component=Rating
// "value" (0-5) is the filled-star count; tapping a star in a prototype changes to that value,
// and tapping the current one clears to 0, as `nextRating` does.
import figma from 'figma'
const instance = figma.selectedInstance

const size = instance.getEnum('size', { sm: 'sm', md: 'md', lg: 'lg', touch: 'touch' })
const tone = instance.getEnum('tone', { warning: 'warning', primary: 'primary' })
const value = instance.getEnum('value', { '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5 })

export default {
  example: figma.code`<Rating value={${value}} onChange={setValue} size="${size}"${tone === 'primary' ? ' tone="primary"' : ''} />`,
  imports: ['import { Rating } from "@marktiderman/genesis-ui"'],
  id: 'rating',
  metadata: { nestable: true },
}
