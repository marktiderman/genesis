// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=70-186
// source=packages/ui/src/components/ui/slider.tsx
// component=Slider
import figma from 'figma'
const instance = figma.selectedInstance

const value = instance.getEnum('value', { '0': '0', '25': '25', '50': '50', '75': '75', '100': '100' })

export default {
  example: figma.code`<Slider defaultValue={[${value}]} max={100} step={1} />`,
  imports: ['import { Slider } from "@marktiderman/genesis-ui"'],
  id: 'slider',
  metadata: { nestable: true },
}
