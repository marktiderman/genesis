// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=55-237
// source=packages/ui-native/src/components/live-indicator.tsx
// component=NativeLiveIndicator
import figma from 'figma'
const instance = figma.selectedInstance

const label = instance.getString('Label')
const variant = instance.getEnum('variant', { pill: 'pill', dot: 'dot' })
const live = instance.getEnum('live', { true: true, false: false })

export default {
  example: figma.code`<NativeLiveIndicator${live ? '' : ' live={false}'}${variant !== 'pill' ? figma.code` variant="${variant}"` : ''}${label && label !== 'Live' ? figma.code` label={${JSON.stringify(label)}}` : ''} />`,
  imports: ['import { NativeLiveIndicator } from "@marktiderman/genesis-ui-native"'],
  id: 'native-live-indicator',
  metadata: { nestable: true },
}
