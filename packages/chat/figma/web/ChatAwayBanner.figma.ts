// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=106-143
// source=packages/chat/src/web/availability.tsx
// component=ChatAwayBanner
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<ChatAwayBanner availability={availability} name={name} />`,
  imports: ['import { ChatAwayBanner } from "@marktiderman/genesis-chat/web"'],
  id: 'chat-web-chat-away-banner',
  metadata: { nestable: false },
}
