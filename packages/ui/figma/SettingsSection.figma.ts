// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=60-1918
// source=packages/ui/src/components/resource/ResourceSettingsPage.tsx
// component=SettingsSection
import figma from 'figma'
const instance = figma.selectedInstance

const title = instance.getString('Title')
const description = instance.getBoolean('Show description') ? instance.getString('Description') : ''

export default {
  example: figma.code`<SettingsSection title="${title}"${description ? figma.code` description="${description}"` : ''}>
  {rows}
</SettingsSection>`,
  imports: ['import { SettingsSection } from "@marktiderman/genesis-ui/resource"'],
  id: 'settings-section',
  metadata: { nestable: true },
}
