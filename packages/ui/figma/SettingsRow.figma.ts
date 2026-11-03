// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=60-1902
// source=packages/ui/src/components/patterns/settings-row.tsx
// component=SettingsRow
// The row's trailing control is a slot: whatever the designer drops in is the child.
import figma from 'figma'
const instance = figma.selectedInstance

const disabled = instance.getEnum('disabled', { false: 'false', true: 'true' })
const label = instance.getString('Label')
const description = instance.getString('Description')
const showDescription = instance.getBoolean('Show description')

export default {
  example: figma.code`<SettingsRow label="${label}"${showDescription ? figma.code` description="${description}"` : ''}${disabled === 'true' ? ' disabled' : ''}>
  {control}
</SettingsRow>`,
  imports: ['import { SettingsRow } from "@marktiderman/genesis-ui"'],
  id: 'settings-row',
  metadata: { nestable: true },
}
