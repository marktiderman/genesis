// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=60-1943
// source=packages/ui/src/components/layout/settings-page.tsx
// component=SettingsPage
// The sections (nav rail entries and their panels) come from code: sections={[{ id, title, content }]}.
import figma from 'figma'
const instance = figma.selectedInstance

const title = instance.getString('Title')
const description = instance.getString('Description')

export default {
  example: figma.code`<SettingsPage
  title="${title}"${description ? figma.code`
  description="${description}"` : ''}
  sections={sections}
/>`,
  imports: ['import { SettingsPage } from "@marktiderman/genesis-ui"'],
  id: 'settings-page',
  metadata: { nestable: false },
}
