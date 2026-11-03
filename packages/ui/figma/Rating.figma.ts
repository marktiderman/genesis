// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=71-510
// source=packages/ui/src/components/patterns/rating.tsx
// component=Rating
// The filled-star count is the app's `value`, so it is not a mapped property.
import figma from 'figma'
const instance = figma.selectedInstance

const size = instance.getEnum('size', { sm: 'sm', md: 'md', lg: 'lg' })

export default {
  example: figma.code`<Rating value={value} onChange={setValue} size="${size}" />`,
  imports: ['import { Rating } from "@marktiderman/genesis-ui"'],
  id: 'rating',
  metadata: { nestable: true },
}
