// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=7-175
// source=packages/ui-native/src/components/chip-group.tsx
// component=NativeChipGroup
// The Figma component has no mode property (an unwired one kept it out of the published
// library); the snippet shows single selection, and `mode="multiple"` takes an array value.
import figma from 'figma'

export default {
  example: figma.code`<NativeChipGroup mode="single" value={selected} onChange={setSelected}>
  {chips}
</NativeChipGroup>`,
  imports: ['import { NativeChipGroup } from "@marktiderman/genesis-ui-native"'],
  id: 'native-chip-group',
  metadata: { nestable: true },
}
