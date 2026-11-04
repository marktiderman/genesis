// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=93-125
// source=packages/ui/src/components/data/ConflictSheet.tsx
// component=ConflictSheet
// The title, description and column headings come from the UI messages (useUiMessages().conflict);
// the Figma text properties only preview them. "Keep mine" shows when the conflict carries a
// current version; the fields table lists conflict.fields.
import figma from 'figma'
const instance = figma.selectedInstance

const showFields = instance.getBoolean('Show fields')

export default {
  example: figma.code`<ConflictSheet
  ${showFields ? 'conflict={conflict}' : 'conflict={{ ...conflict, fields: [] }}'}
  noun="session"
  onKeepMine={() => save({ version: conflict.currentVersion })}
  onTakeTheirs={reload}
  onDismiss={() => setConflict(null)}
/>`,
  imports: ['import { ConflictSheet } from "@marktiderman/genesis-ui/data"'],
  id: 'conflict-sheet',
  metadata: { nestable: false },
}
