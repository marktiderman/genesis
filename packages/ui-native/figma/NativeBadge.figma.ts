// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=8-21
// source=packages/ui-native/src/components/badge.tsx
// component=NativeBadge
import figma from 'figma'
const instance = figma.selectedInstance

const label = instance.getString('Label')
const variant = instance.getEnum('variant', {
  default: 'default', secondary: 'secondary', destructive: 'destructive', outline: 'outline',
  success: 'success', warning: 'warning', info: 'info', muted: 'muted',
})

export default {
  example: figma.code`<NativeBadge variant="${variant}">${label}</NativeBadge>`,
  imports: ['import { NativeBadge } from "@marktiderman/genesis-ui-native"'],
  id: 'native-badge',
  metadata: { nestable: true },
}
