// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=59-441
// source=packages/ui/src/components/ui/badge.tsx
// component=Badge
import figma from 'figma'
const instance = figma.selectedInstance

const variant = instance.getEnum('variant', { default: 'default', secondary: 'secondary', destructive: 'destructive', outline: 'outline', success: 'success', warning: 'warning', info: 'info', muted: 'muted' })
const label = instance.getString('Label')

export default {
  example: figma.code`<Badge variant="${variant}">${label}</Badge>`,
  imports: ['import { Badge } from "@marktiderman/genesis-ui"'],
  id: 'badge',
  metadata: { nestable: true },
}
