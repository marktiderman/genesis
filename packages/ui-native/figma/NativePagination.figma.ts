// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=12-370
// source=packages/ui-native/src/components/pagination.tsx
// component=NativePagination
import figma from 'figma'
const instance = figma.selectedInstance

const page = instance.getEnum('position', { first: 1, middle: 5, last: 10 })

export default {
  example: figma.code`<NativePagination pageCount={10} page={${page}} onChange={setPage} />`,
  imports: ['import { NativePagination } from "@marktiderman/genesis-ui-native"'],
  id: 'native-pagination',
  metadata: { nestable: true },
}
