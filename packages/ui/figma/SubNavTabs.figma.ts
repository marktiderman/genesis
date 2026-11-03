// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=59-279
// source=packages/ui/src/components/layout/sub-nav.tsx
// component=SubNavTabs
// "selected" (1|2|3) is the active tab: SubNavTabs derives it from `activePath`, so the
// example points activePath at the selected tab's route.
import figma from 'figma'
const instance = figma.selectedInstance

const tabs = [instance.getString('Tab 1'), instance.getString('Tab 2'), instance.getString('Tab 3')]
const selected = instance.getEnum('selected', { '1': 0, '2': 1, '3': 2 })

const item = (label: string) => figma.code`
    { to: "/${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}", label: "${label}" },`

export default {
  example: figma.code`<SubNavTabs
  items={[${item(tabs[0])}${item(tabs[1])}${item(tabs[2])}
  ]}
  activePath="/${tabs[selected].toLowerCase().replace(/[^a-z0-9]+/g, '-')}"
  linkComponent={DefaultLink}
/>`,
  imports: ['import { SubNavTabs } from "@marktiderman/genesis-ui/layout"', 'import { DefaultLink } from "@marktiderman/genesis-ui"'],
  id: 'sub-nav-tabs',
  metadata: { nestable: true },
}
