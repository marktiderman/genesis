// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=7-43
// source=packages/ui-native/src/components/search-bar.tsx
// component=NativeSearchBar
import figma from 'figma'
const instance = figma.selectedInstance

const placeholder = instance.getString('Placeholder')
const showCancel = instance.getBoolean('Show cancel')

export default {
  example: figma.code`<NativeSearchBar value={query} onChange={setQuery} placeholder="${placeholder}"${showCancel ? ' showCancel' : ''} />`,
  imports: ['import { NativeSearchBar } from "@marktiderman/genesis-ui-native"'],
  id: 'native-search-bar',
  metadata: { nestable: true },
}
