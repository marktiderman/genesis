// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=105-124
// source=packages/chat/src/web/attachments.tsx
// component=Lightbox
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<Lightbox images={images} index={index} onIndexChange={setIndex} />`,
  imports: ['import { Lightbox } from "@marktiderman/genesis-chat/web"'],
  id: 'chat-web-lightbox',
  metadata: { nestable: false },
}
