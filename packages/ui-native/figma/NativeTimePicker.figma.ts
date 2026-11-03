// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=38-39
// source=packages/ui-native/src/components/date-time-picker.tsx
// component=NativeTimePicker
// The Figma "Value" is the formatted time the row shows; in code it comes from `formatLabel`
// over the Date `value`, so it is not emitted.
import figma from 'figma'
const instance = figma.selectedInstance

const label = instance.getString('Label')

export default {
  example: figma.code`<NativeTimePicker label="${label}" value={time} onChange={setTime} />`,
  imports: ['import { NativeTimePicker } from "@marktiderman/genesis-ui-native"'],
  id: 'native-time-picker',
  metadata: { nestable: true },
}
