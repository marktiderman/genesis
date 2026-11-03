// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=60-306
// source=packages/ui/src/components/data/DataBulkBar.tsx
// component=DataBulkBar
// "Count" is the number selected; the bar derives it from `selected`, so it is shown as a
// comment, not a prop.
import figma from 'figma'
const instance = figma.selectedInstance

const count = instance.getString('Count')

export default {
  example: figma.code`<DataBulkBar
  selected={selected} // ${count} selected
  totalCount={items.length}
  onToggleAll={onToggleAll}
  onClearSelection={onClearSelection}
  actions={bulkActions}
/>`,
  imports: ['import { DataBulkBar } from "@marktiderman/genesis-ui/data"'],
  id: 'data-bulk-bar',
  metadata: { nestable: true },
}
