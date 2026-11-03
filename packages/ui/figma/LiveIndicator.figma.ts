// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=71-529
// source=packages/ui/src/components/patterns/live-indicator.tsx
// component=LiveIndicator
import figma from 'figma'
const instance = figma.selectedInstance

const variant = instance.getEnum('variant', { pill: 'pill', dot: 'dot' })
const state = instance.getEnum('state', { live: 'live', idle: 'idle', offline: 'offline' })

export default {
  example: figma.code`<LiveIndicator variant="${variant}" state="${state}" />`,
  imports: ['import { LiveIndicator } from "@marktiderman/genesis-ui"'],
  id: 'live-indicator',
  metadata: { nestable: true },
}
