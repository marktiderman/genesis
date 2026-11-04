// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=167-334
// source=packages/ui-native/src/components/share-sheet.tsx
// component=NativeShareSheet
// The title ("Share your {noun}"), description, link row, Copy link and Share buttons are
// drawn by the sheet from its props, so only "qr" maps: qr=true passes renderQr (the app's QR
// renderer). The link comes from `url` (null while it loads).
import figma from 'figma'
const instance = figma.selectedInstance

const qr = instance.getEnum('qr', { false: false, true: true })

export default {
  example: figma.code`<NativeShareSheet
  open={open}
  onOpenChange={setOpen}
  noun="page"
  url={url}${qr ? figma.code`
  renderQr={(link) => <QrCode value={link} />}` : ''}
  onCopy={copyToClipboard}
/>`,
  imports: ['import { NativeShareSheet } from "@marktiderman/genesis-ui-native"'],
  id: 'native-share-sheet',
  metadata: { nestable: false },
}
