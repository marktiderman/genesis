// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=72-233
// source=packages/ui/src/components/data/DataGrid.tsx
// component=DataGrid
import figma from 'figma'
const instance = figma.selectedInstance

const viewMode = instance.getEnum('viewMode', { grid: 'grid', table: 'table', list: 'list' })

export default {
  example: figma.code`<DataGrid
  items={items}
  viewMode="${viewMode}"
  renderCard={(item) => <ItemCard item={item} />}
  renderTable={(items) => <ItemsTable items={items} />}
  renderListItem={(item) => <ItemRow item={item} />}
/>`,
  imports: ['import { DataGrid } from "@marktiderman/genesis-ui/data"'],
  id: 'data-grid',
  metadata: { nestable: true },
}
