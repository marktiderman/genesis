// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=13-40
// source=packages/ui-native/src/components/list-item.tsx
// component=NativeListItem
import figma from 'figma'
const instance = figma.selectedInstance

const title = instance.getString('Title')
const showSubtitle = instance.getBoolean('Show subtitle')
const subtitle = showSubtitle ? instance.getString('Subtitle') : undefined
const showLeading = instance.getBoolean('Show leading')
const leading = showLeading ? instance.getInstanceSwap('Leading icon') : null
let leadingCode
if (leading && leading.type === 'INSTANCE') {
  leadingCode = leading.executeTemplate().example
}
const value = instance.getString('Value')
const accessory = instance.getEnum('accessory', { chevron: 'chevron', switch: 'switch', value: 'value', none: 'none' })

let trailing = ''
if (accessory === 'value') trailing = figma.code`
  trailing={<NativeText preset="body-sm">${value}</NativeText>}`
else if (accessory === 'switch') trailing = figma.code`
  trailing={<NativeSwitch checked={on} onCheckedChange={setOn} />}`

export default {
  example: figma.code`<NativeListItem
  title="${title}"${subtitle ? figma.code`
  subtitle="${subtitle}"` : ''}${leadingCode ? figma.code`
  leading={${leadingCode}}` : ''}${trailing}${accessory === 'chevron' ? '\n  showChevron' : ''}
  onPress={() => {}}
/>`,
  imports: ['import { NativeListItem, NativeText, NativeSwitch } from "@marktiderman/genesis-ui-native"'],
  id: 'native-list-item',
  metadata: { nestable: true },
}
