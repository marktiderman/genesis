// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=55-178
// source=packages/ui-native/src/components/rating.tsx
// component=NativeRating
import figma from 'figma'
const instance = figma.selectedInstance

const value = instance.getEnum('value', { '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5 })
const size = instance.getEnum('size', { sm: 'sm', md: 'md', lg: 'lg', touch: 'touch' })
const tone = instance.getEnum('tone', { warning: 'warning', primary: 'primary' })

export default {
  example: figma.code`<NativeRating value={${value}} onChange={setRating}${size !== 'md' ? figma.code` size="${size}"` : ''}${tone !== 'warning' ? figma.code` tone="${tone}"` : ''} />`,
  imports: ['import { NativeRating } from "@marktiderman/genesis-ui-native"'],
  id: 'native-rating',
  metadata: { nestable: true },
}
