// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=72-318
// source=packages/ui/src/components/patterns/sortable-list.tsx
// component=SortableList
// The state=idle|dragging property is an interaction state and is not emitted. Item 1-3 are the
// sample rows' text; the rows come from `items`.
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<SortableList
  label="Reorder items"
  items={items}
  getKey={(item) => item.id}
  getItemLabel={(item) => item.name}
  renderItem={(item) => <ItemRow item={item} />}
  onReorder={(from, to) => reorder(from, to)}
/>`,
  imports: ['import { SortableList } from "@marktiderman/genesis-ui"'],
  id: 'sortable-list',
  metadata: { nestable: true },
}
