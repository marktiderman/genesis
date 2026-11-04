// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=106-96
// source=packages/chat/src/web/composer.tsx
// component=ChatComposer
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<ChatComposer conversation={conversation} replyTo={replyTo} onCancelReply={cancelReply} />`,
  imports: ['import { ChatComposer } from "@marktiderman/genesis-chat/web"'],
  id: 'chat-web-chat-composer',
  metadata: { nestable: false },
}
