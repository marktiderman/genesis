// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=60-1917
// source=packages/ui/src/components/patterns/toggle-row.tsx
// component=ToggleRow
import figma from 'figma'
const instance = figma.selectedInstance

const checked = instance.getEnum('checked', { false: 'false', true: 'true' })
const label = instance.getString('Label')
const description = instance.getString('Description')
const showDescription = instance.getBoolean('Show description')

export default {
  example: figma.code`<ToggleRow
  label="${label}"${showDescription ? figma.code`
  description="${description}"` : ''}
  checked={${checked}}
  onCheckedChange={setChecked}
/>`,
  imports: ['import { ToggleRow } from "@marktiderman/genesis-ui"'],
  id: 'toggle-row',
  metadata: { nestable: true },
}
