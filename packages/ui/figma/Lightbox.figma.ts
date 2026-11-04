// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=73-793
// source=packages/ui/src/components/patterns/lightbox.tsx
// component=Lightbox
// Counter ("2 / 8") is derived from `index` and `items`, so it is not mapped.
import figma from 'figma'
const instance = figma.selectedInstance

const title = instance.getString('Title')
const showActions = instance.getBoolean('Show actions')

export default {
  example: figma.code`<Lightbox
  open={open}
  onOpenChange={setOpen}
  items={items}
  index={index}
  onIndexChange={setIndex}
  title="${title}"${showActions ? `
  renderActions={(item) => <Rating value={ratings[item.id] ?? 0} onChange={(v) => rate(item, v)} size="sm" />}` : ''}
/>`,
  imports: [`import { Lightbox${showActions ? ', Rating' : ''} } from "@marktiderman/genesis-ui"`],
  id: 'lightbox',
  metadata: { nestable: false },
}
