// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=63-453
// source=packages/ui/src/components/data/DetailPanel.tsx
// component=DetailPanel
// The Description property is the panel's subtitle.
import figma from 'figma'
const instance = figma.selectedInstance

const layout = instance.getEnum('layout', { inline: 'inline', dialog: 'dialog', sheet: 'sheet' })
const title = instance.getString('Title')
const description = instance.getString('Description')

export default {
  example: figma.code`<DetailPanel
  item={item}
  open={open}
  onClose={() => setOpen(false)}
  title="${title}"${description ? figma.code`
  subtitle="${description}"` : ''}
  layout="${layout}"
  fields={[{ key: "name", label: "Name" }]}
/>`,
  imports: ['import { DetailPanel } from "@marktiderman/genesis-ui/data"'],
  id: 'detail-panel',
  metadata: { nestable: false },
}
