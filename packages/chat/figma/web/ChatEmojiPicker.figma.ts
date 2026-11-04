// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=106-170
// source=packages/chat/src/web/emoji-picker.tsx
// component=ChatEmojiPicker
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<ChatEmojiPicker onSelect={insertEmoji} />`,
  imports: ['import { ChatEmojiPicker } from "@marktiderman/genesis-chat/web"'],
  id: 'chat-web-chat-emoji-picker',
  metadata: { nestable: false },
}
