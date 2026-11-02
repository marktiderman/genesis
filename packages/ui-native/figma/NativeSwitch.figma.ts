// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=7-58
// source=packages/ui-native/src/components/switch.tsx
// component=NativeSwitch
import figma from 'figma'
const instance = figma.selectedInstance

const checked = instance.getEnum('checked', { true: true, false: false })
const disabled = instance.getEnum('disabled', { true: true, false: false })

export default {
  example: figma.code`<NativeSwitch checked={${checked}} onCheckedChange={setChecked}${disabled ? ' disabled' : ''} />`,
  imports: ['import { NativeSwitch } from "@marktiderman/genesis-ui-native"'],
  id: 'native-switch',
  metadata: { nestable: true },
}
