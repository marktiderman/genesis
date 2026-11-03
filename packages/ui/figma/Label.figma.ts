// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=70-123
// source=packages/ui/src/components/ui/label.tsx
// component=Label
// Label has no `required` prop; the required marker is FormLabel's (a Label plus the asterisk).
import figma from 'figma'
const instance = figma.selectedInstance

const required = instance.getEnum('required', { false: 'false', true: 'true' })
const label = instance.getString('Label')

export default {
  example: required === 'true'
    ? figma.code`<FormLabel htmlFor="field" required>${label}</FormLabel>`
    : figma.code`<Label htmlFor="field">${label}</Label>`,
  imports: ['import { FormLabel, Label } from "@marktiderman/genesis-ui"'],
  id: 'label',
  metadata: { nestable: true },
}
