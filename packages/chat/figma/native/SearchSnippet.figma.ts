// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=101-211
// source=packages/chat/src/native/search-screen.tsx
// component=SearchSnippet
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<SearchSnippet snippet={hit.snippet} />`,
  imports: ['import { SearchSnippet } from "@marktiderman/genesis-chat/native"'],
  id: 'chat-native-search-snippet',
  metadata: { nestable: true },
}
