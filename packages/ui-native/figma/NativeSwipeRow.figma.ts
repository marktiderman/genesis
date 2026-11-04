// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=140-103
// source=packages/ui-native/src/components/swipe-row.tsx
// component=NativeSwipeRow
// The `open` variant only shows which side a swipe uncovers; it has no prop. The two labels
// become the actions' labels: the leading one `side: "leading"`, the trailing one destructive.
import figma from 'figma'
const instance = figma.selectedInstance

const leadingLabel = instance.getString('leadingLabel')
const trailingLabel = instance.getString('trailingLabel')
const rowSwap = instance.getInstanceSwap('row')
let row
if (rowSwap && rowSwap.type === 'INSTANCE') row = rowSwap.executeTemplate().example

export default {
  example: figma.code`<NativeSwipeRow
  actions={[
    { id: "leading", label: "${leadingLabel}", side: "leading", onPress: onLeading },
    { id: "trailing", label: "${trailingLabel}", destructive: true, onPress: onTrailing },
  ]}
>
  ${row ?? '{row}'}
</NativeSwipeRow>`,
  imports: ['import { NativeSwipeRow } from "@marktiderman/genesis-ui-native"'],
  id: 'native-swipe-row',
  metadata: { nestable: false },
}
