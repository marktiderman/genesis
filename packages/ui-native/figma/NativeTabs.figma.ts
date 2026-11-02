// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=12-318
// source=packages/ui-native/src/components/tabs.tsx
// component=NativeTabs
import figma from 'figma'
const instance = figma.selectedInstance

const tabs = [instance.getString('Tab 1'), instance.getString('Tab 2'), instance.getString('Tab 3')]
const selected = instance.getEnum('selected', { '1': 0, '2': 1, '3': 2 })
const defaultValue = tabs[selected]

const trigger = (label: string) => figma.code`
    <NativeTabsTrigger value="${label}">${label}</NativeTabsTrigger>`
const content = (label: string) => figma.code`
  <NativeTabsContent value="${label}">{${label.toLowerCase().replace(/[^a-z0-9]+/g, '')}}</NativeTabsContent>`

export default {
  example: figma.code`<NativeTabs defaultValue="${defaultValue}">
  <NativeTabsList>${trigger(tabs[0])}${trigger(tabs[1])}${trigger(tabs[2])}
  </NativeTabsList>${content(tabs[0])}${content(tabs[1])}${content(tabs[2])}
</NativeTabs>`,
  imports: ['import { NativeTabs, NativeTabsList, NativeTabsTrigger, NativeTabsContent } from "@marktiderman/genesis-ui-native"'],
  id: 'native-tabs',
  metadata: { nestable: true },
}
