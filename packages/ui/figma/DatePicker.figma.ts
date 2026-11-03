// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=71-433
// source=packages/ui/src/components/ui/date-picker.tsx
// component=DatePicker
// The state=closed|open property is an interaction state and is not emitted. Value is the
// formatted date the button shows; the component takes a Date, so it is not mapped.
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<DatePicker value={date} onChange={setDate} />`,
  imports: ['import { DatePicker } from "@marktiderman/genesis-ui"'],
  id: 'date-picker',
  metadata: { nestable: true },
}
