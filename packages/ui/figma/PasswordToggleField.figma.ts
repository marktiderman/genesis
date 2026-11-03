// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=70-166
// source=packages/ui/src/components/ui/password-toggle-field.tsx
// component=PasswordToggleField
// The state=hidden|shown property is the reveal toggle, an interaction state, and is not emitted.
import figma from 'figma'
const instance = figma.selectedInstance

const value = instance.getString('Value')

export default {
  example: figma.code`<PasswordToggleField>
  <PasswordToggleFieldInput defaultValue="${value}" />
  <PasswordToggleFieldToggle>
    <PasswordToggleFieldIcon visible={<Eye />} hidden={<EyeOff />} />
  </PasswordToggleFieldToggle>
</PasswordToggleField>`,
  imports: [
    'import { PasswordToggleField, PasswordToggleFieldIcon, PasswordToggleFieldInput, PasswordToggleFieldToggle } from "@marktiderman/genesis-ui"',
    'import { Eye, EyeOff } from "lucide-react"',
  ],
  id: 'password-toggle-field',
  metadata: { nestable: true },
}
