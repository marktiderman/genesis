// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=38-35
// source=packages/ui-native/src/components/date-time-picker.tsx
// component=NativeDatePicker
// The Figma "Label" and "Value" are what the row shows; neither is a prop. The label is the
// field the screen puts beside the picker, and the value comes from `formatLabel` over the Date
// `value`, so neither is emitted.
import figma from 'figma'

export default {
  example: figma.code`<NativeDatePicker value={date} onChange={setDate} />`,
  imports: ['import { NativeDatePicker } from "@marktiderman/genesis-ui-native"'],
  id: 'native-date-picker',
  metadata: { nestable: true },
}
