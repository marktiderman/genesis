// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=100-209
// source=packages/chat/src/native/media.tsx
// component=MessageAttachments
import figma from 'figma'
const instance = figma.selectedInstance
const mine = instance.getEnum('mine', { false: false, true: true })

export default {
  example: figma.code`<MessageAttachments attachments={attachments} mine={${mine ? 'true' : 'false'}} onOpenImage={openImage} testID="chat-attachments" />`,
  imports: ['import { MessageAttachments } from "@marktiderman/genesis-chat/native"'],
  id: 'chat-native-message-attachments',
  metadata: { nestable: true },
}
