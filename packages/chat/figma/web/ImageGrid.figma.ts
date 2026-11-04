// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=105-123
// source=packages/chat/src/web/attachments.tsx
// component=ImageGrid
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<ImageGrid images={images} />`,
  imports: ['import { ImageGrid } from "@marktiderman/genesis-chat/web"'],
  id: 'chat-web-image-grid',
  metadata: { nestable: true },
}
