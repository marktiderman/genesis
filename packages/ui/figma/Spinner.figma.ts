// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=60-379
// source=packages/ui/src/components/ui/spinner.tsx
// component=Spinner
import figma from 'figma'
const instance = figma.selectedInstance

const size = instance.getEnum('size', { sm: 'sm', default: 'default', lg: 'lg' })

export default {
  example: figma.code`<Spinner size="${size}" />`,
  imports: ['import { Spinner } from "@marktiderman/genesis-ui"'],
  id: 'spinner',
  metadata: { nestable: true },
}
