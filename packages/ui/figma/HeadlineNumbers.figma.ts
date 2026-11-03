// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=74-93
// source=packages/ui/src/components/resource/HeadlineNumbers.tsx
// component=HeadlineNumbers
// Every number in the set shares the one tone.
import figma from 'figma'
const instance = figma.selectedInstance

const tone = instance.getEnum('tone', { positive: 'positive', negative: 'negative', warning: 'warning', muted: 'muted' })
const value1 = instance.getString('Value 1')
const value2 = instance.getString('Value 2')
const value3 = instance.getString('Value 3')
const detail1 = instance.getString('Detail 1')
const detail2 = instance.getString('Detail 2')
const detail3 = instance.getString('Detail 3')
const label1 = instance.getString('Label 1')
const label2 = instance.getString('Label 2')
const label3 = instance.getString('Label 3')

export default {
  example: figma.code`<HeadlineNumbers
  numbers={[
    { key: "first", label: "${label1}", value: "${value1}", detail: "${detail1}", tone: "${tone}" },
    { key: "second", label: "${label2}", value: "${value2}", detail: "${detail2}", tone: "${tone}" },
    { key: "third", label: "${label3}", value: "${value3}", detail: "${detail3}", tone: "${tone}" },
  ]}
/>`,
  imports: ['import { HeadlineNumbers } from "@marktiderman/genesis-ui/resource"'],
  id: 'headline-numbers',
  metadata: { nestable: true },
}
