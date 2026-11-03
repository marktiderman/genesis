// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=73-679
// source=packages/ui/src/components/patterns/empty-state.tsx
// component=NoSearchResults
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<NoSearchResults query={query} onClear={() => setQuery("")} />`,
  imports: ['import { NoSearchResults } from "@marktiderman/genesis-ui"'],
  id: 'no-search-results',
  metadata: { nestable: true },
}
