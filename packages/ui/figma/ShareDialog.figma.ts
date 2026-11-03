// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=74-246
// source=packages/ui/src/components/resource/ShareDialog.tsx
// component=ShareDialog
import figma from 'figma'
const instance = figma.selectedInstance

const defaultTab = instance.getEnum('defaultTab', { link: 'link', qr: 'qr', embed: 'embed' })
const title = instance.getString('Title')
const url = instance.getString('Url')

export default {
  example: figma.code`<ShareDialog
  open={open}
  onOpenChange={setOpen}
  title="${title}"
  url="${url}"
  name={name}
  defaultTab="${defaultTab}"
/>`,
  imports: ['import { ShareDialog } from "@marktiderman/genesis-ui/resource"'],
  id: 'share-dialog',
  metadata: { nestable: false },
}
