// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=72-47
// source=packages/ui/src/components/data/KanbanBoard.tsx
// component=KanbanBoard
// Column 1-4 are the column headers ("Show column 4" adds the fourth); each column's items are
// data, so they come from `columns`. "Show card badge" is a Badge inside renderCard.
import figma from 'figma'
const instance = figma.selectedInstance

const column1 = instance.getString('Column 1')
const column2 = instance.getString('Column 2')
const column3 = instance.getString('Column 3')
const showColumn4 = instance.getBoolean('Show column 4')
const column4 = instance.getString('Column 4')
const showCardBadge = instance.getBoolean('Show card badge')

export default {
  example: figma.code`<KanbanBoard
  columns={[
    { key: "column-1", label: "${column1}", items: column1Items },
    { key: "column-2", label: "${column2}", items: column2Items },
    { key: "column-3", label: "${column3}", items: column3Items },${showColumn4 ? `\n    { key: "column-4", label: "${column4}", items: column4Items },` : ''}
  ]}
  renderCard={(item) => <ItemCard item={item}${showCardBadge ? ' badge={<Badge variant="outline">{item.priority}</Badge>}' : ''} />}
/>`,
  imports: ['import { KanbanBoard } from "@marktiderman/genesis-ui/data"', 'import { Badge } from "@marktiderman/genesis-ui"'],
  id: 'kanban-board',
  metadata: { nestable: true },
}
