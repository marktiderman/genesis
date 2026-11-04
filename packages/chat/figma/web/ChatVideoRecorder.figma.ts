// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=106-258
// source=packages/chat/src/web/video.tsx
// component=ChatVideoRecorder
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<ChatVideoRecorder open={open} onOpenChange={setOpen} conversationId={conversationId} maxMs={60_000} send={conversation.send} />`,
  imports: ['import { ChatVideoRecorder } from "@marktiderman/genesis-chat/web"'],
  id: 'chat-web-chat-video-recorder',
  metadata: { nestable: false },
}
