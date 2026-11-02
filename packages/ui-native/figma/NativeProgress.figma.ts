// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=8-196
// source=packages/ui-native/src/components/progress.tsx
// component=NativeProgress
import figma from 'figma'
const instance = figma.selectedInstance

const value = instance.getEnum('value', { '0': 0, '25': 25, '50': 50, '75': 75, '100': 100 })

export default {
  example: figma.code`<NativeProgress value={${value}} />`,
  imports: ['import { NativeProgress } from "@marktiderman/genesis-ui-native"'],
  id: 'native-progress',
  metadata: { nestable: true },
}
