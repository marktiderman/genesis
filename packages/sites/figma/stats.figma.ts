// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=136-201
// source=packages/sites/src/sections/stats.tsx
// component=stats
import figma from 'figma'
const instance = figma.selectedInstance
const variant = instance.getEnum('variant', { "row": "row", "cards": "cards" })
export default {
  example: figma.code`{
  id: "stats",
  type: "stats",
  v: 1,
  variant: "${variant}",
  props: { heading: "A place people stay", items: [{ value: "400+", label: "members" }] },
}`,
  imports: ['import "@marktiderman/genesis-sites/sections"'],
  id: 'sites-section-stats',
  metadata: { nestable: false },
}
