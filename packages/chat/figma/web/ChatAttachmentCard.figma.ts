// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=106-169
// source=packages/chat/src/web/cards.tsx
// component=ChatAttachmentCard
import figma from 'figma'
const instance = figma.selectedInstance
const title = instance.getString('Title')
const subtitle = instance.getString('Subtitle')
const action = instance.getString('Action')
const tone = instance.getEnum('tone', { default: 'default', primary: 'primary' })

export default {
  example: figma.code`<ChatAttachmentCard
  title={${JSON.stringify(title)}}
  subtitle={${JSON.stringify(subtitle)}}
  action={{ label: ${JSON.stringify(action)}, onPress: open }}${tone === 'primary' ? '\n  tone="primary"' : ''}
/>`,
  imports: ['import { ChatAttachmentCard } from "@marktiderman/genesis-chat/web"'],
  id: 'chat-web-chat-attachment-card',
  metadata: { nestable: true },
}
