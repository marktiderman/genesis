// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=60-1121
// source=packages/ui/src/components/data/DataFilters.tsx
// component=DataFilters
import figma from 'figma'
const instance = figma.selectedInstance

const showSavedViews = instance.getBoolean('Show saved views')
const showStatusChips = instance.getBoolean('Show status chips')
const searchPlaceholder = instance.getString('Search placeholder')

export default {
  example: figma.code`<DataFilters
  search={search}
  onSearchChange={setSearch}${searchPlaceholder ? figma.code`
  searchPlaceholder="${searchPlaceholder}"` : ''}
  sort={sort}
  onSortChange={setSort}
  sortOptions={sortOptions}
  filters={filters}${showStatusChips ? figma.code`
  statusChips={{ options: statuses, selected: selectedStatuses, onChange: setSelectedStatuses }}` : ''}${showSavedViews ? figma.code`
  savedViews={savedViews}
  onLoadView={onLoadView}
  onSaveView={onSaveView}
  onDeleteView={onDeleteView}
  canSaveViews` : ''}
/>`,
  imports: ['import { DataFilters } from "@marktiderman/genesis-ui/data"'],
  id: 'data-filters',
  metadata: { nestable: true },
}
