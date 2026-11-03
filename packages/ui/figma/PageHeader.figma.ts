// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=59-596
// source=packages/ui/src/components/layout/PageHeader.tsx
// component=PageHeader
import figma from 'figma'
const instance = figma.selectedInstance

const density = instance.getEnum('density', { compact: 'compact', comfortable: 'comfortable', spacious: 'spacious' })
const title = instance.getString('Title')
const subtitle = instance.getString('Subtitle')
const showCount = instance.getBoolean('Show count')
const showViewToggle = instance.getBoolean('Show view toggle')
const showActions = instance.getBoolean('Show actions')
const showStats = instance.getBoolean('Show stats')

export default {
  example: figma.code`<PageHeader
  title="${title}"${subtitle ? figma.code`
  subtitle="${subtitle}"` : ''}
  density="${density}"${showCount ? figma.code`
  count={items.length}` : ''}${showViewToggle ? figma.code`
  viewMode={viewMode}
  onViewModeChange={setViewMode}` : ''}${showActions ? figma.code`
  actions={actions}` : ''}${showStats ? figma.code`
  stats={stats}` : ''}
  options={{ showCount: ${showCount}, showViewToggle: ${showViewToggle}, showStats: ${showStats} }}
/>`,
  imports: ['import { PageHeader } from "@marktiderman/genesis-ui/layout"'],
  id: 'page-header',
  metadata: { nestable: false },
}
