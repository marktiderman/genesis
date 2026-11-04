// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=135-545
// source=packages/sites/src/sections/logos.tsx
// component=logos
import figma from 'figma'
const instance = figma.selectedInstance
const variant = instance.getEnum('variant', { "row": "row", "grid": "grid", "trust-bar": "trust-bar" })
export default {
  example: figma.code`{
  id: "logos",
  type: "logos",
  v: 1,
  variant: "${variant}",
  props: { heading: "Partners we work with", items: [{ name: "Northwind" }] },
}`,
  imports: ['import "@marktiderman/genesis-sites/sections"'],
  id: 'sites-section-logos',
  metadata: { nestable: false },
}
