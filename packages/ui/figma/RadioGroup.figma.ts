// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=59-941
// source=packages/ui/src/components/ui/radio-group.tsx
// component=RadioGroup
import figma from 'figma'
const instance = figma.selectedInstance

const selected = instance.getEnum('selected', { 1: '1', 2: '2', 3: '3' })
const option1 = instance.getString('Option 1')
const option2 = instance.getString('Option 2')
const option3 = instance.getString('Option 3')

export default {
  example: figma.code`<RadioGroup value="option-${selected}" onValueChange={setValue}>
  <div className="flex items-center gap-2">
    <RadioGroupItem value="option-1" id="option-1" />
    <Label htmlFor="option-1">${option1}</Label>
  </div>
  <div className="flex items-center gap-2">
    <RadioGroupItem value="option-2" id="option-2" />
    <Label htmlFor="option-2">${option2}</Label>
  </div>
  <div className="flex items-center gap-2">
    <RadioGroupItem value="option-3" id="option-3" />
    <Label htmlFor="option-3">${option3}</Label>
  </div>
</RadioGroup>`,
  imports: ['import { Label, RadioGroup, RadioGroupItem } from "@marktiderman/genesis-ui"'],
  id: 'radio-group',
  metadata: { nestable: true },
}
