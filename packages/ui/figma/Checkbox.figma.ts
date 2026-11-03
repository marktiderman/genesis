// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=59-894
// source=packages/ui/src/components/ui/checkbox.tsx
// component=Checkbox
import figma from 'figma'
const instance = figma.selectedInstance

const checked = instance.getEnum('checked', { false: 'false', true: 'true', indeterminate: '"indeterminate"' })
const label = instance.getString('Label')

export default {
  example: figma.code`<div className="flex items-center gap-2">
  <Checkbox id="terms" checked={${checked}} onCheckedChange={setChecked} />
  <Label htmlFor="terms">${label}</Label>
</div>`,
  imports: ['import { Checkbox, Label } from "@marktiderman/genesis-ui"'],
  id: 'checkbox',
  metadata: { nestable: true },
}
