// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=166-1319
// source=packages/ui-native/src/components/bulk-bar.tsx
// component=NativeBulkBar
// "Count" is the number selected; the bar derives it from `selected`, so it is shown as a
// comment, not a prop. "all" (every row selected) checks the select-all box, which the bar
// also derives (selected.size === totalCount). The action buttons are the `actions` array.
import figma from 'figma'
const instance = figma.selectedInstance

const count = instance.getString('Count')

export default {
  example: figma.code`<NativeBulkBar
  selected={selected} // ${count}
  totalCount={items.length}
  onToggleAll={onToggleAll}
  onClearSelection={onClearSelection}
  actions={[
    { label: "Archive", icon: "file", onClick: onArchive },
    { label: "Delete", icon: "trash", variant: "destructive", onClick: onDelete },
  ]}
/>`,
  imports: ['import { NativeBulkBar } from "@marktiderman/genesis-ui-native"'],
  id: 'native-bulk-bar',
  metadata: { nestable: true },
}
