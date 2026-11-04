// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=105-24
// source=packages/chat/src/web/bubble.tsx
// component=MessageRow
import figma from 'figma'
const instance = figma.selectedInstance
const highlighted = instance.getBoolean('Highlighted')

export default {
  example: figma.code`<MessageRow item={item} startsGroup={startsGroup}${highlighted ? ' highlighted' : ''} />`,
  imports: ['import { MessageRow } from "@marktiderman/genesis-chat/web"'],
  id: 'chat-web-message-row',
  metadata: { nestable: false },
}
