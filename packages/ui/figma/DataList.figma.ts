// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=72-261
// source=packages/ui/src/components/data/DataList.tsx
// component=DataList
// Title 1-3 are the sample rows' text; the rows come from `items`, so they are not mapped.
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<DataList items={items} renderItem={(item) => <ItemRow item={item} />} />`,
  imports: ['import { DataList } from "@marktiderman/genesis-ui/data"'],
  id: 'data-list',
  metadata: { nestable: true },
}
