// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=136-292
// source=packages/sites/src/sections/gallery.tsx
// component=gallery
import figma from 'figma'
const instance = figma.selectedInstance
const variant = instance.getEnum('variant', { "grid": "grid", "masonry": "masonry" })
export default {
  example: figma.code`{
  id: "gallery",
  type: "gallery",
  v: 1,
  variant: "${variant}",
  props: { heading: "Inside the studio", images: [{ src: "/studio.jpg", alt: "The main room" }] },
}`,
  imports: ['import "@marktiderman/genesis-sites/sections"'],
  id: 'sites-section-gallery',
  metadata: { nestable: false },
}
