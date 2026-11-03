// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=72-47
// source=packages/ui/src/components/data/KanbanBoard.tsx
// component=KanbanBoard
// Column 1-3 are the column headers; each column's items are data, so they come from `columns`.
import figma from 'figma'
const instance = figma.selectedInstance

const column1 = instance.getString('Column 1')
const column2 = instance.getString('Column 2')
const column3 = instance.getString('Column 3')

export default {
  example: figma.code`<KanbanBoard
  columns={[
    { key: "column-1", label: "${column1}", items: column1Items },
    { key: "column-2", label: "${column2}", items: column2Items },
    { key: "column-3", label: "${column3}", items: column3Items },
  ]}
  renderCard={(item) => <ItemCard item={item} />}
/>`,
  imports: ['import { KanbanBoard } from "@marktiderman/genesis-ui/data"'],
  id: 'kanban-board',
  metadata: { nestable: true },
}
