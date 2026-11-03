// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=63-454
// source=packages/ui/src/components/layout/detail-page.tsx
// component=DetailPage
// The Description property is the page's subtitle.
import figma from 'figma'
const instance = figma.selectedInstance

const title = instance.getString('Title')
const description = instance.getString('Description')

export default {
  example: figma.code`<DetailPage
  title="${title}"${description ? figma.code`
  subtitle="${description}"` : ''}
  actions={actions}
>
  {content}
</DetailPage>`,
  imports: ['import { DetailPage } from "@marktiderman/genesis-ui"'],
  id: 'detail-page',
  metadata: { nestable: false },
}
