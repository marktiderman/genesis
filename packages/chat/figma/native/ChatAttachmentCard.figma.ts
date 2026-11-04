// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=103-278
// source=packages/chat/src/native/attachment-cards.tsx
// component=ChatAttachmentCard
import figma from 'figma'
const instance = figma.selectedInstance
const mine = instance.getEnum('mine', { false: false, true: true })

export default {
  example: figma.code`<ChatAttachmentCard attachment={attachment} message={message} kind={kinds[attachment.kind]}${mine ? ' mine' : ''} onOpenAttachment={openAttachment} />`,
  imports: ['import { ChatAttachmentCard } from "@marktiderman/genesis-chat/native"'],
  id: 'chat-native-chat-attachment-card',
  metadata: { nestable: true },
}
