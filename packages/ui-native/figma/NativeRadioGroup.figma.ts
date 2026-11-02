// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=7-103
// source=packages/ui-native/src/components/radio-group.tsx
// component=NativeRadioGroup
// NativeRadioGroupItem draws only the control; each option's text is a NativeLabel beside it.
import figma from 'figma'
const instance = figma.selectedInstance

const options = [instance.getString('Option 1'), instance.getString('Option 2'), instance.getString('Option 3')]
const selected = instance.getEnum('selected', { '1': 0, '2': 1, '3': 2 })
const value = options[selected]

const item = (label: string) => figma.code`
  <NativeRadioGroupItem value="${label}" />
  <NativeLabel>${label}</NativeLabel>`

export default {
  example: figma.code`<NativeRadioGroup value="${value}" onValueChange={setValue}>${item(options[0])}${item(options[1])}${item(options[2])}
</NativeRadioGroup>`,
  imports: ['import { NativeRadioGroup, NativeRadioGroupItem, NativeLabel } from "@marktiderman/genesis-ui-native"'],
  id: 'native-radio-group',
  metadata: { nestable: true },
}
