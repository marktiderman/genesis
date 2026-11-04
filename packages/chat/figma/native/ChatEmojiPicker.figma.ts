// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=101-101
// source=packages/chat/src/native/emoji-picker.tsx
// component=ChatEmojiPicker
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<ChatEmojiPicker onSelect={insertEmoji} userId={userId} />`,
  imports: ['import { ChatEmojiPicker } from "@marktiderman/genesis-chat/native"'],
  id: 'chat-native-chat-emoji-picker',
  metadata: { nestable: false },
}
