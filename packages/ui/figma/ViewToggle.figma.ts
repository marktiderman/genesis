// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=60-91
// source=packages/ui/src/components/patterns/view-toggle.tsx
// component=ViewToggle
import figma from 'figma'
const instance = figma.selectedInstance

const viewMode = instance.getEnum('viewMode', { grid: 'grid', table: 'table', list: 'list' })

export default {
  example: figma.code`<ViewToggle viewMode="${viewMode}" onViewModeChange={setViewMode} />`,
  imports: ['import { ViewToggle } from "@marktiderman/genesis-ui/patterns"'],
  id: 'view-toggle',
  metadata: { nestable: true },
}
