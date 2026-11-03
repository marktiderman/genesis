// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=60-390
// source=packages/ui/src/components/ui/progress.tsx
// component=Progress
import figma from 'figma'
const instance = figma.selectedInstance

const value = instance.getEnum('value', { 0: '0', 25: '25', 50: '50', 75: '75', 100: '100' })

export default {
  example: figma.code`<Progress value={${value}} />`,
  imports: ['import { Progress } from "@marktiderman/genesis-ui"'],
  id: 'progress',
  metadata: { nestable: true },
}
