// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=93-41
// source=packages/ui-native/src/components/slider.tsx
// component=NativeRangeSlider
import figma from 'figma'
const instance = figma.selectedInstance

const range = instance.getEnum('range', { '0-100': [0, 100], '25-75': [25, 75], '40-60': [40, 60] })

export default {
  example: figma.code`<NativeRangeSlider value={[${range[0]}, ${range[1]}]} onChange={setRange} min={0} max={100} />`,
  imports: ['import { NativeRangeSlider } from "@marktiderman/genesis-ui-native"'],
  id: 'native-range-slider',
  metadata: { nestable: true },
}
