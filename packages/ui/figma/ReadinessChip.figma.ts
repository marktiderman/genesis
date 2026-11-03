// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=74-17
// source=packages/ui/src/components/resource/ReadinessChip.tsx
// component=ReadinessChip
import figma from 'figma'
const instance = figma.selectedInstance

const readiness = instance.getEnum('readiness', { ready: 'ready', problems: 'problems', warnings: 'warnings', empty: 'empty', pending: 'pending' })

export default {
  example: figma.code`<ReadinessChip readiness={{ state: "${readiness}", count }} />`,
  imports: ['import { ReadinessChip } from "@marktiderman/genesis-ui/resource"'],
  id: 'readiness-chip',
  metadata: { nestable: true },
}
