// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=105-151
// source=packages/chat/src/web/attachments.tsx
// component=FileChip
import figma from 'figma'
const instance = figma.selectedInstance
const tone = instance.getEnum('tone', { default: 'default', primary: 'primary' })

export default {
  example: figma.code`<FileChip view={view}${tone === 'primary' ? ' tone="primary"' : ''} />`,
  imports: ['import { FileChip } from "@marktiderman/genesis-chat/web"'],
  id: 'chat-web-file-chip',
  metadata: { nestable: true },
}
