// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=12-296
// source=packages/ui-native/src/components/tab-bar.tsx
// component=NativeTabBar
// Each "Tab N" is a TabBar/Item instance: its Label, Show badge and Badge count become the
// item's label and badge. "more" means there are more items than fit, so the fifth slot is
// the More button the bar draws itself (the extra items are listed after the fourth). "active"
// is the selected slot; with more=true, active=5 means the current tab is one of the extras.
// The icon is a NativeIcon the app picks, so it is left as a placeholder.
import figma from 'figma'
const instance = figma.selectedInstance

const active = instance.getEnum('active', { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4 })
const more = instance.getEnum('more', { false: false, true: true })

const slots = more ? ['Tab 1', 'Tab 2', 'Tab 3', 'Tab 4'] : ['Tab 1', 'Tab 2', 'Tab 3', 'Tab 4', 'Tab 5']
const items = slots.map((layer) => {
  const tab = instance.findInstance(layer)
  const label = tab && tab.type === 'INSTANCE' ? tab.getString('Label') : layer
  const badge = tab && tab.type === 'INSTANCE' && tab.getBoolean('Show badge') ? tab.getString('Badge count') : ''
  const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return { key, label, badge }
})
const extras = more ? [{ key: 'settings', label: 'Settings', badge: '' }, { key: 'help', label: 'Help', badge: '' }] : []
const all = [...items, ...extras]
const value = all[Math.min(active, all.length - 1)].key
const item = (i: { key: string; label: string; badge: string }) =>
  `
    { key: "${i.key}", label: "${i.label}", icon: <NativeIcon name="home" />${i.badge ? `, badge: ${i.badge}` : ''} },`

export default {
  example: figma.code`<NativeTabBar
  items={[${all.map(item).join('')}
  ]}
  value="${value}"
  onChange={setTab}
/>`,
  imports: ['import { NativeTabBar, NativeIcon } from "@marktiderman/genesis-ui-native"'],
  id: 'native-tab-bar',
  metadata: { nestable: true },
}
