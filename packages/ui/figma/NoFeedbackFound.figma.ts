// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=73-667
// source=packages/ui/src/components/patterns/empty-state.tsx
// component=NoFeedbackFound
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<NoFeedbackFound />`,
  imports: ['import { NoFeedbackFound } from "@marktiderman/genesis-ui"'],
  id: 'no-feedback-found',
  metadata: { nestable: true },
}
