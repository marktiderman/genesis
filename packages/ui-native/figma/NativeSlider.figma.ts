// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=7-124
// source=packages/ui-native/src/components/slider.tsx
// component=NativeSlider
import figma from 'figma'
const instance = figma.selectedInstance

const value = instance.getEnum('value', { '0': 0, '25': 25, '50': 50, '75': 75, '100': 100 })

export default {
  example: figma.code`<NativeSlider value={${value}} onChange={setValue} min={0} max={100} />`,
  imports: ['import { NativeSlider } from "@marktiderman/genesis-ui-native"'],
  id: 'native-slider',
  metadata: { nestable: true },
}
