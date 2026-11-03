// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=38-34
// source=packages/ui-native/src/components/combobox.tsx
// component=NativeCombobox
// The Figma "state" (default | open) is interaction, not a prop: the open list is what the
// component renders while the query matches options.
import figma from 'figma'
const instance = figma.selectedInstance

const placeholder = instance.getString('Placeholder')

export default {
  example: figma.code`<NativeCombobox
  options={options}
  value={value}
  onChange={setValue}${placeholder ? figma.code`
  placeholder="${placeholder}"` : ''}
/>`,
  imports: ['import { NativeCombobox } from "@marktiderman/genesis-ui-native"'],
  id: 'native-combobox',
  metadata: { nestable: true },
}
