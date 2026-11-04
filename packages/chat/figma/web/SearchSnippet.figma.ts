// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=106-147
// source=packages/chat/src/web/search.tsx
// component=SearchSnippet
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<SearchSnippet snippet={hit.snippet} />`,
  imports: ['import { SearchSnippet } from "@marktiderman/genesis-chat/web"'],
  id: 'chat-web-search-snippet',
  metadata: { nestable: true },
}
