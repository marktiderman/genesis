// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=135-366
// source=packages/sites/src/sections/testimonials.tsx
// component=testimonials
import figma from 'figma'
const instance = figma.selectedInstance
const variant = instance.getEnum('variant', { "grid": "grid", "single": "single" })
export default {
  example: figma.code`{
  id: "testimonials",
  type: "testimonials",
  v: 1,
  variant: "${variant}",
  props: { heading: "What people say", items: [{ quote: "Small groups make all the difference.", name: "Sam Rivera" }] },
}`,
  imports: ['import "@marktiderman/genesis-sites/sections"'],
  id: 'sites-section-testimonials',
  metadata: { nestable: false },
}
