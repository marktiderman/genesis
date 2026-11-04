// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=101-58
// source=packages/chat/src/native/composer.tsx
// component=ChatComposer
import figma from 'figma'
const instance = figma.selectedInstance
const canPost = instance.getEnum('canPost', { true: 'true', false: 'false' })

export default {
  example: figma.code`<ChatComposer
  composer={composer}
  canPost={${canPost}}
  disabledReason={${canPost === 'true' ? 'null' : 'disabledReason'}}
  role={role}
  onSend={send}
/>`,
  imports: ['import { ChatComposer } from "@marktiderman/genesis-chat/native"'],
  id: 'chat-native-chat-composer',
  metadata: { nestable: false },
}
