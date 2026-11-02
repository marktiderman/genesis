// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=7-174
// source=packages/ui-native/src/components/chip-group.tsx
// component=NativeChip
// Selection comes from the enclosing NativeChipGroup's value, so the "selected" variant is
// not a prop here; NativeChip has no icon prop, so "Show icon" is not emitted.
import figma from 'figma'
const instance = figma.selectedInstance

const label = instance.getString('Label')

export default {
  example: figma.code`<NativeChip value="${label}">${label}</NativeChip>`,
  imports: ['import { NativeChip } from "@marktiderman/genesis-ui-native"'],
  id: 'native-chip',
  metadata: { nestable: true },
}
