// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=38-35
// source=packages/ui-native/src/components/date-time-picker.tsx
// component=NativeDatePicker
// The Figma "Value" is the formatted date the row shows; in code it comes from `formatLabel`
// over the Date `value`, so it is not emitted.
import figma from 'figma'
const instance = figma.selectedInstance

const label = instance.getString('Label')

export default {
  example: figma.code`<NativeDatePicker label="${label}" value={date} onChange={setDate} />`,
  imports: ['import { NativeDatePicker } from "@marktiderman/genesis-ui-native"'],
  id: 'native-date-picker',
  metadata: { nestable: true },
}
