// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=41-81
// source=packages/ui-native/src/components/image.tsx
// component=NativeImage
// The Figma picture is a placeholder fill; `src` and `alt` come from the data.
import figma from 'figma'
const instance = figma.selectedInstance

const contentFit = instance.getEnum('contentFit', { cover: 'cover', contain: 'contain' })

export default {
  example: figma.code`<NativeImage src={imageUrl} alt={altText} width={200} height={140}${contentFit !== 'cover' ? figma.code` contentFit="${contentFit}"` : ''} />`,
  imports: ['import { NativeImage } from "@marktiderman/genesis-ui-native"'],
  id: 'native-image',
  metadata: { nestable: true },
}
