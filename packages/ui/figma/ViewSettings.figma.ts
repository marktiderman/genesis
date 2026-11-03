// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=60-161
// source=packages/ui/src/components/patterns/view-settings.tsx
// component=ViewSettings
// "state" (closed | open) is interaction: the popover opens from its trigger, so it is
// not a prop and is not emitted.
import figma from 'figma'
const _instance = figma.selectedInstance

export default {
  example: figma.code`<ViewSettings
  pageSize={pageSize}
  onPageSizeChange={setPageSize}
  density={density}
  onDensityChange={setDensity}
/>`,
  imports: ['import { ViewSettings } from "@marktiderman/genesis-ui/patterns"'],
  id: 'view-settings',
  metadata: { nestable: true },
}
