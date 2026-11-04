// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=161-1807
// source=packages/ui/src/components/ui/tier-badge.tsx
// component=TierBadge
import figma from 'figma'
const instance = figma.selectedInstance

const label = instance.getString('Label')
const showIcon = instance.getBoolean('Show icon')
// tone=accent stands for any key of the brand's accents; "gold" is the example.
const tone = instance.getEnum('tone', { neutral: '', accent: ' tone="gold"' })
const size = instance.getEnum('size', { sm: ' size="sm"', md: '' })

export default {
  example: figma.code`<TierBadge label="${label}"${tone}${size}${showIcon ? ' icon={<Star />}' : ''} />`,
  imports: ['import { TierBadge } from "@marktiderman/genesis-ui"'],
  id: 'tier-badge',
  metadata: { nestable: true },
}
