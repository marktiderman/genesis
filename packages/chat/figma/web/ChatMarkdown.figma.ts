// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=105-76
// source=packages/chat/src/web/markdown.tsx
// component=ChatMarkdown
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<ChatMarkdown text={message.body} me={me} />`,
  imports: ['import { ChatMarkdown } from "@marktiderman/genesis-chat/web"'],
  id: 'chat-web-chat-markdown',
  metadata: { nestable: true },
}
