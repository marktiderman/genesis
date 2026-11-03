// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=39-33
// source=packages/ui-native/src/components/number-input.tsx
// component=NativeNumberInput
import figma from 'figma'
const instance = figma.selectedInstance

// The Figma "Value" is display text; it is emitted only when it is a plain number, else the
// snippet reads the value from state.
const raw = instance.getString('Value')
const value = /^-?\d+(\.\d+)?$/.test(raw.trim()) ? raw.trim() : 'value'
const disabled = instance.getEnum('disabled', { false: false, true: true })

export default {
  example: figma.code`<NativeNumberInput value={${value}} onChange={setValue} min={0} step={1}${disabled ? ' disabled' : ''} />`,
  imports: ['import { NativeNumberInput } from "@marktiderman/genesis-ui-native"'],
  id: 'native-number-input',
  metadata: { nestable: true },
}
