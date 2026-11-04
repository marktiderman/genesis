// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=103-238
// source=packages/chat/src/native/link-preview.tsx
// component=ChatLinkPreviewCard
import figma from 'figma'
const instance = figma.selectedInstance
const mine = instance.getEnum('mine', { false: false, true: true })
const images = instance.getEnum('images', { false: false, true: true })

export default {
  example: figma.code`<ChatLinkPreviewCard preview={preview}${mine ? ' mine' : ''}${images ? ' images' : ''} />`,
  imports: ['import { ChatLinkPreviewCard } from "@marktiderman/genesis-chat/native"'],
  id: 'chat-native-chat-link-preview-card',
  metadata: { nestable: true },
}
