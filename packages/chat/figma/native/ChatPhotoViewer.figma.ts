// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=103-308
// source=packages/chat/src/native/photo-viewer.tsx
// component=ChatPhotoViewer
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<ChatPhotoViewer photos={photos} initialIndex={index} onClose={() => setPhotos(null)} />`,
  imports: ['import { ChatPhotoViewer } from "@marktiderman/genesis-chat/native"'],
  id: 'chat-native-chat-photo-viewer',
  metadata: { nestable: false },
}
