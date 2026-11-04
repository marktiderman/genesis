// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=135-140
// source=packages/sites/src/sections/hero.tsx
// component=hero
import figma from 'figma'
const instance = figma.selectedInstance
const variant = instance.getEnum('variant', { "centered": "centered", "split": "split", "image-bg": "image-bg" })
export default {
  example: figma.code`{
  id: "hero",
  type: "hero",
  v: 1,
  variant: "${variant}",
  props: { heading: "Say what you do, for whom", body: "One or two sentences on why it matters.", primaryCta: { label: "Get started", href: "#contact" } },
}`,
  imports: ['import "@marktiderman/genesis-sites/sections"'],
  id: 'sites-section-hero',
  metadata: { nestable: false },
}
