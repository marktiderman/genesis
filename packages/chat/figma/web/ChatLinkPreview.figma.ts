// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=105-197
// source=packages/chat/src/web/cards.tsx
// component=ChatLinkPreview
import figma from 'figma'
const instance = figma.selectedInstance
const tone = instance.getEnum('tone', { default: 'default', primary: 'primary' })
const images = instance.getEnum('images', { on: 'proxy', off: 'off' })

export default {
  example: figma.code`<ChatLinkPreview preview={preview}${images !== 'off' ? ' images="proxy" proxyUrl={imageProxy}' : ''}${tone === 'primary' ? ' tone="primary"' : ''} />`,
  imports: ['import { ChatLinkPreview } from "@marktiderman/genesis-chat/web"'],
  id: 'chat-web-chat-link-preview',
  metadata: { nestable: true },
}
