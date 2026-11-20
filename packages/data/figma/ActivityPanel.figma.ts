// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=131-331
// source=packages/data/src/DataStudio.tsx
// component=ActivityPanel
import figma from 'figma'

export default {
  example: figma.code`<ActivityPanel entries={entries} onUndo={undo} />`,
  imports: ['import { ActivityPanel } from "@marktiderman/genesis-data"'],
  id: 'studio-activity-panel',
  metadata: { nestable: true },
}
