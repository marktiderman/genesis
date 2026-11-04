// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=105-155
// source=packages/chat/src/web/attachments.tsx
// component=GenericAttachment
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<GenericAttachment attachment={attachment} url={url} message={message} mine={mine} />`,
  imports: ['import { GenericAttachment } from "@marktiderman/genesis-chat/web"'],
  id: 'chat-web-generic-attachment',
  metadata: { nestable: true },
}
