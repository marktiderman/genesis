// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=12-318
// source=packages/ui-native/src/components/tabs.tsx
// component=NativeTabs
// "tabs" (3|4|5) is how many triggers show; "Show badge N" puts a NativeBadge in trigger N
// (NativeTabsTrigger takes children, so the badge is composed beside the label).
import figma from 'figma'
const instance = figma.selectedInstance

const count = instance.getEnum('tabs', { '3': 3, '4': 4, '5': 5 })
const tabs = [
  instance.getString('Tab 1'),
  instance.getString('Tab 2'),
  instance.getString('Tab 3'),
  instance.getString('Tab 4'),
  instance.getString('Tab 5'),
].slice(0, count)
const badges = [
  instance.getBoolean('Show badge 1'),
  instance.getBoolean('Show badge 2'),
  instance.getBoolean('Show badge 3'),
  instance.getBoolean('Show badge 4'),
  instance.getBoolean('Show badge 5'),
]
const selected = instance.getEnum('selected', { '1': 0, '2': 1, '3': 2 })
const defaultValue = tabs[Math.min(selected, tabs.length - 1)]

const trigger = (label: string, i: number) =>
  badges[i]
    ? `
    <NativeTabsTrigger value="${label}">
      <NativeText>${label}</NativeText>
      <NativeBadge variant="secondary">{count}</NativeBadge>
    </NativeTabsTrigger>`
    : `
    <NativeTabsTrigger value="${label}">${label}</NativeTabsTrigger>`
const content = (label: string) => `
  <NativeTabsContent value="${label}">{${label.toLowerCase().replace(/[^a-z0-9]+/g, '')}}</NativeTabsContent>`

export default {
  example: figma.code`<NativeTabs defaultValue="${defaultValue}">
  <NativeTabsList>${tabs.map(trigger).join('')}
  </NativeTabsList>${tabs.map(content).join('')}
</NativeTabs>`,
  imports: [
    'import { NativeTabs, NativeTabsList, NativeTabsTrigger, NativeTabsContent, NativeBadge, NativeText } from "@marktiderman/genesis-ui-native"',
  ],
  id: 'native-tabs',
  metadata: { nestable: true },
}
