// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=71-317
// source=packages/ui/src/components/ui/calendar.tsx
// component=Calendar
// The Month text is the displayed month (a date the app holds), so it is not mapped.
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<Calendar mode="single" selected={date} onSelect={setDate} />`,
  imports: ['import { Calendar } from "@marktiderman/genesis-ui"'],
  id: 'calendar',
  metadata: { nestable: true },
}
