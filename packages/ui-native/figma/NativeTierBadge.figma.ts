// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=161-1840
// source=packages/ui-native/src/components/tier-badge.tsx
// component=NativeTierBadge
import figma from 'figma'
const instance = figma.selectedInstance

const label = instance.getString('Label')
const showIcon = instance.getBoolean('Show icon')
// tone=accent stands for any key of the brand's accents; "gold" is the example.
const tone = instance.getEnum('tone', { neutral: '', accent: ' tone="gold"' })
const size = instance.getEnum('size', { sm: ' size="sm"', md: '' })

export default {
  example: figma.code`<NativeTierBadge label="${label}"${tone}${size}${showIcon ? ' icon="star"' : ''} />`,
  imports: ['import { NativeTierBadge } from "@marktiderman/genesis-ui-native"'],
  id: 'native-tier-badge',
  metadata: { nestable: true },
}
