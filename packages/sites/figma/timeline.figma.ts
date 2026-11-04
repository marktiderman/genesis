// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=136-806
// source=packages/sites/src/sections/timeline.tsx
// component=timeline
import figma from 'figma'
const instance = figma.selectedInstance
const variant = instance.getEnum('variant', { "vertical": "vertical", "cards": "cards" })
export default {
  example: figma.code`{
  id: "timeline",
  type: "timeline",
  v: 1,
  variant: "${variant}",
  props: { heading: "Your first month", steps: [{ title: "Your free intro" }] },
}`,
  imports: ['import "@marktiderman/genesis-sites/sections"'],
  id: 'sites-section-timeline',
  metadata: { nestable: false },
}
