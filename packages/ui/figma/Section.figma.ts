// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=59-835
// source=packages/ui/src/components/layout/section.tsx
// component=Section
import figma from 'figma'
const instance = figma.selectedInstance

const level = instance.getEnum('level', { '2': 2, '3': 3, '4': 4 })
const title = instance.getString('Title')
const description = instance.getString('Description')
const showActions = instance.getBoolean('Show actions')

export default {
  example: figma.code`<Section
  title="${title}"${description ? figma.code`
  description="${description}"` : ''}
  level={${level}}${showActions ? figma.code`
  actions={actions}` : ''}
>
  {children}
</Section>`,
  imports: ['import { Section } from "@marktiderman/genesis-ui"'],
  id: 'section',
  metadata: { nestable: true },
}
