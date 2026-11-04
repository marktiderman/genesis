// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=101-213
// source=packages/chat/src/native/availability.tsx
// component=ChatAwayLine
import figma from 'figma'
const instance = figma.selectedInstance
const text = instance.getString('Text')

export default {
  example: figma.code`<ChatAwayLine text="${text}" />`,
  imports: ['import { ChatAwayLine } from "@marktiderman/genesis-chat/native"'],
  id: 'chat-native-chat-away-line',
  metadata: { nestable: true },
}
