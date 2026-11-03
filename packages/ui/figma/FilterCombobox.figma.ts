// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=60-45
// source=packages/ui/src/components/data/FilterCombobox.tsx
// component=FilterCombobox
// "state" (closed | open) is interaction: the popover opens when the filter is clicked,
// so it is not a prop and is not emitted.
import figma from 'figma'
const instance = figma.selectedInstance

const label = instance.getString('Label')

export default {
  example: figma.code`<FilterCombobox
  label="${label}"
  icon={Tag}
  options={options}
  selected={selected}
  onChange={setSelected}
/>`,
  imports: ['import { FilterCombobox } from "@marktiderman/genesis-ui/data"'],
  id: 'filter-combobox',
  metadata: { nestable: true },
}
