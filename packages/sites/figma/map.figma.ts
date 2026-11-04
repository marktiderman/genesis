// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=136-749
// source=packages/sites/src/sections/map.tsx
// component=map
import figma from 'figma'
const instance = figma.selectedInstance
const variant = instance.getEnum('variant', { "split": "split", "stacked": "stacked" })
export default {
  example: figma.code`{
  id: "map",
  type: "map",
  v: 1,
  variant: "${variant}",
  props: { heading: "Visit the studio", address: ["12 Mill Lane", "Anytown"], provider: "openstreetmap" },
}`,
  imports: ['import "@marktiderman/genesis-sites/sections"'],
  id: 'sites-section-map',
  metadata: { nestable: false },
}
