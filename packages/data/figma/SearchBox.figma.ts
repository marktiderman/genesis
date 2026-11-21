// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=129-257
// source=packages/data/src/toolbar/Toolbar.tsx
// component=SearchBox
import figma from 'figma'

export default {
  example: figma.code`<SearchBox value={query} onChange={setQuery} />`,
  imports: ['import { SearchBox } from "@marktiderman/genesis-data"'],
  id: 'studio-search-box',
  metadata: { nestable: true },
}
