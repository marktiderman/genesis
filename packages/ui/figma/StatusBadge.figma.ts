// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=59-454
// source=packages/ui/src/components/patterns/status-badge.tsx
// component=StatusBadge
import figma from 'figma'
const instance = figma.selectedInstance

const status = instance.getEnum('status', { onTrack: 'onTrack', done: 'done', atRisk: 'atRisk', inProgress: 'inProgress', offTrack: 'offTrack', blocked: 'blocked' })

export default {
  example: figma.code`<StatusBadge status="${status}">${status}</StatusBadge>`,
  imports: ['import { StatusBadge } from "@marktiderman/genesis-ui"'],
  id: 'status-badge',
  metadata: { nestable: true },
}
