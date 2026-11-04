// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=101-166
// source=packages/chat/src/native/start-sheet.tsx
// component=ChatStartButton
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<ChatStartButton onPress={() => setStarting(true)} />`,
  imports: ['import { ChatStartButton } from "@marktiderman/genesis-chat/native"'],
  id: 'chat-native-chat-start-button',
  metadata: { nestable: true },
}
