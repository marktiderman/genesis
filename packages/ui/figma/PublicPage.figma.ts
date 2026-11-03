// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=76-329
// source=packages/ui/src/components/layout/public-page.tsx
// component=PublicPage
import figma from 'figma'
const instance = figma.selectedInstance

const maxWidth = instance.getEnum('maxWidth', { sm: 'sm', md: 'md', lg: 'lg', full: 'full' })
const title = instance.getString('Title')
const description = instance.getString('Description')
const showPoweredBy = instance.getBoolean('Show powered by')

export default {
  example: figma.code`<PublicPage
  title="${title}"
  description="${description}"
  maxWidth="${maxWidth}"${showPoweredBy ? figma.code`
  poweredBy={poweredBy}` : ''}
>
  {children}
</PublicPage>`,
  imports: ['import { PublicPage } from "@marktiderman/genesis-ui/layout"'],
  id: 'public-page',
  metadata: { nestable: false },
}
