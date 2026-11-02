// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=7-42
// source=packages/ui-native/src/components/select.tsx
// component=NativeSelect
// "Value" is the selected item's text. "state": disabled → the trigger's disabled prop;
// "open" is interaction state with no prop.
import figma from 'figma'
const instance = figma.selectedInstance

const value = instance.getString('Value')
const state = instance.getEnum('state', { default: 'default', open: 'open', disabled: 'disabled' })

export default {
  example: figma.code`<NativeSelect value="${value}" onValueChange={setValue}>
  <NativeSelectTrigger placeholder="Choose"${state === 'disabled' ? ' disabled' : ''} />
  <NativeSelectContent>
    <NativeSelectItem value="${value}">${value}</NativeSelectItem>
  </NativeSelectContent>
</NativeSelect>`,
  imports: ['import { NativeSelect, NativeSelectTrigger, NativeSelectContent, NativeSelectItem } from "@marktiderman/genesis-ui-native"'],
  id: 'native-select',
  metadata: { nestable: true },
}
