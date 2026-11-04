// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=101-188
// source=packages/chat/src/native/access-error.tsx
// component=ChatAccessError
import figma from 'figma'
const instance = figma.selectedInstance
const retrying = instance.getEnum('retrying', { false: false, true: true })

export default {
  example: figma.code`<ChatAccessError onRetry={retry}${retrying ? ' retrying' : ''} />`,
  imports: ['import { ChatAccessError } from "@marktiderman/genesis-chat/native"'],
  id: 'chat-native-chat-access-error',
  metadata: { nestable: false },
}
