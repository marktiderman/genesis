// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=7-175
// source=packages/ui-native/src/components/chip-group.tsx
// component=NativeChipGroup
import figma from 'figma'
const instance = figma.selectedInstance

const mode = instance.getString('mode') === 'multiple' ? 'multiple' : 'single'

export default {
  example: figma.code`<NativeChipGroup mode="${mode}" value={${mode === 'multiple' ? 'selected' : 'selected[0]'}} onChange={setSelected}>
  {chips}
</NativeChipGroup>`,
  imports: ['import { NativeChipGroup } from "@marktiderman/genesis-ui-native"'],
  id: 'native-chip-group',
  metadata: { nestable: true },
}
