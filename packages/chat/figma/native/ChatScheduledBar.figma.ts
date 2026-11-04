// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=103-301
// source=packages/chat/src/native/schedule-sheet.tsx
// component=ChatScheduledBar
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<ChatScheduledBar conversationId={conversationId} />`,
  imports: ['import { ChatScheduledBar } from "@marktiderman/genesis-chat/native"'],
  id: 'chat-native-chat-scheduled-bar',
  metadata: { nestable: false },
}
