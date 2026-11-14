// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=295-1368
// source=packages/ui/src/components/data/DataBulkBar.tsx
// component=DataBulkBar
// "selection" is how much is selected (some rows, every loaded row, every matching row); the bar
// derives it from `selected` and `totalCount`, so it is shown as a comment, not a prop.
import figma from 'figma'
const instance = figma.selectedInstance

const selection = instance.getEnum('selection', {
  some: 'some rows selected',
  page: 'every loaded row selected',
  'all-matching': 'every matching row selected',
})

export default {
  example: figma.code`<DataBulkBar
  selected={selected} // ${selection}
  totalCount={items.length}
  onToggleAll={onToggleAll}
  onClearSelection={onClearSelection}
  actions={bulkActions}
/>`,
  imports: ['import { DataBulkBar } from "@marktiderman/genesis-ui/data"'],
  id: 'data-bulk-bar',
  metadata: { nestable: true },
}
