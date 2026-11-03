// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=59-907
// source=packages/ui/src/components/ui/switch.tsx
// component=Switch
import figma from 'figma'
const instance = figma.selectedInstance

const checked = instance.getEnum('checked', { false: 'false', true: 'true' })
const disabled = instance.getEnum('disabled', { false: 'false', true: 'true' })

export default {
  example: figma.code`<Switch checked={${checked}} onCheckedChange={setChecked}${disabled === 'true' ? ' disabled' : ''} />`,
  imports: ['import { Switch } from "@marktiderman/genesis-ui"'],
  id: 'switch',
  metadata: { nestable: true },
}
