// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=73-655
// source=packages/ui/src/components/patterns/empty-state.tsx
// component=NoFeaturesFound
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<NoFeaturesFound onCreate={onCreate} />`,
  imports: ['import { NoFeaturesFound } from "@marktiderman/genesis-ui"'],
  id: 'no-features-found',
  metadata: { nestable: true },
}
