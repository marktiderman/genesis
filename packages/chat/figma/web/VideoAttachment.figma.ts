// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=105-152
// source=packages/chat/src/web/attachments.tsx
// component=VideoAttachment
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<VideoAttachment view={view} />`,
  imports: ['import { VideoAttachment } from "@marktiderman/genesis-chat/web"'],
  id: 'chat-web-video-attachment',
  metadata: { nestable: true },
}
