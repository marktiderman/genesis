// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=7-165
// source=packages/ui-native/src/components/segmented-control.tsx
// component=NativeSegmentedControl
import figma from 'figma'
const instance = figma.selectedInstance

const count = instance.getEnum('options', { '2': 2, '3': 3, '4': 4, '5': 5 })
const labels = [
  instance.getString('Option 1'),
  instance.getString('Option 2'),
  instance.getString('Option 3'),
  instance.getString('Option 4'),
  instance.getString('Option 5'),
].slice(0, count)
const selected = instance.getEnum('selected', { '1': 0, '2': 1, '3': 2 })
const value = labels[Math.min(selected, labels.length - 1)]
const options = labels.map((label) => `{ value: "${label}", label: "${label}" }`).join(', ')

export default {
  example: figma.code`<NativeSegmentedControl
  options={[${options}]}
  value="${value}"
  onChange={setValue}
/>`,
  imports: ['import { NativeSegmentedControl } from "@marktiderman/genesis-ui-native"'],
  id: 'native-segmented-control',
  metadata: { nestable: true },
}
