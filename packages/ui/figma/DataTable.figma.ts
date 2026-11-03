// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=60-1377
// source=packages/ui/src/components/data/DataTable.tsx
// component=DataTable
import figma from 'figma'
const instance = figma.selectedInstance

const density = instance.getEnum('density', { compact: 'compact', comfortable: 'comfortable', spacious: 'spacious' })
const selectable = instance.getBoolean('Selectable')

export default {
  example: figma.code`<DataTable
  items={items}
  columns={columns}
  getKey={(item) => item.id}
  density="${density}"${selectable ? figma.code`
  selectable
  selected={selected}
  onToggleSelect={onToggleSelect}
  onToggleAll={onToggleAll}` : ''}
/>`,
  imports: ['import { DataTable } from "@marktiderman/genesis-ui/data"'],
  id: 'data-table',
  metadata: { nestable: true },
}
