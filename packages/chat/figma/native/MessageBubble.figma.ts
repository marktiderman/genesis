// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=100-50
// source=packages/chat/src/native/message-bubble.tsx
// component=MessageBubble
import figma from 'figma'
const instance = figma.selectedInstance
const from = instance.getEnum('from', { them: 'them', me: 'me' })
const status = instance.getEnum('status', { sent: 'sent', failed: 'failed' })
// The row, its message and the reply and reaction state come from buildThreadRows; the design shows a sample.

export default {
  example: figma.code`<MessageBubble
  row={row /* ${from === 'me' ? 'your message' : 'their message'}${status === 'failed' ? ', failed to send' : ''} */}
  me={me}
  urls={urls}
  group={false}
  reducedMotion={reducedMotion}
  onLongPress={openActions}
  onRetry={retry}
  testID="chat-message"
/>`,
  imports: ['import { MessageBubble } from "@marktiderman/genesis-chat/native"'],
  id: 'chat-native-message-bubble',
  metadata: { nestable: false },
}
