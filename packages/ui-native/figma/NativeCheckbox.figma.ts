// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=7-72
// source=packages/ui-native/src/components/checkbox.tsx
// component=NativeCheckbox
// NativeCheckbox draws only the box: the "Label" text is a sibling NativeLabel in code, and
// "indeterminate" has no prop (it renders unchecked).
import figma from 'figma'
const instance = figma.selectedInstance

const label = instance.getString('Label')
const disabled = instance.getBoolean('disabled')
const checked = instance.getEnum('checked', { true: true, false: false, indeterminate: false })

export default {
  example: figma.code`<NativeCheckbox checked={${checked}} onCheckedChange={setChecked}${disabled ? ' disabled' : ''} />
<NativeLabel${disabled ? ' disabled' : ''}>${label}</NativeLabel>`,
  imports: ['import { NativeCheckbox, NativeLabel } from "@marktiderman/genesis-ui-native"'],
  id: 'native-checkbox',
  metadata: { nestable: true },
}
