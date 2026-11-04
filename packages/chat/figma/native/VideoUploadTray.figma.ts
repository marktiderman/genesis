// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=103-191
// source=packages/chat/src/native/video-upload-tray.tsx
// component=VideoUploadTray
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<VideoUploadTray conversationId={conversationId} userId={userId} />`,
  imports: ['import { VideoUploadTray } from "@marktiderman/genesis-chat/native"'],
  id: 'chat-native-video-upload-tray',
  metadata: { nestable: false },
}
