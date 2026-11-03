// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=39-33
// source=packages/ui-native/src/components/number-input.tsx
// component=NativeNumberInput
import figma from 'figma'
const instance = figma.selectedInstance

const value = instance.getString('Value')
const disabled = instance.getEnum('disabled', { false: false, true: true })

export default {
  example: figma.code`<NativeNumberInput value={${value || '0'}} onChange={setValue} min={0} step={1}${disabled ? ' disabled' : ''} />`,
  imports: ['import { NativeNumberInput } from "@marktiderman/genesis-ui-native"'],
  id: 'native-number-input',
  metadata: { nestable: true },
}
