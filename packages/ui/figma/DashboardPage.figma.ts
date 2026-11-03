// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=63-494
// source=packages/ui/src/components/layout/dashboard-page.tsx
// component=DashboardPage
// The Description property is the page's subtitle.
import figma from 'figma'
const instance = figma.selectedInstance

const title = instance.getString('Title')
const description = instance.getString('Description')

export default {
  example: figma.code`<DashboardPage
  title="${title}"${description ? figma.code`
  subtitle="${description}"` : ''}
  stats={stats}
>
  {content}
</DashboardPage>`,
  imports: ['import { DashboardPage } from "@marktiderman/genesis-ui"'],
  id: 'dashboard-page',
  metadata: { nestable: false },
}
