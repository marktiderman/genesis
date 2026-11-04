// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=135-304
// source=packages/sites/src/sections/cta.tsx
// component=cta
import figma from 'figma'
const instance = figma.selectedInstance
const variant = instance.getEnum('variant', { "banner": "banner", "card": "card", "split": "split" })
export default {
  example: figma.code`{
  id: "cta",
  type: "cta",
  v: 1,
  variant: "${variant}",
  props: { heading: "Ready to start?", body: "Your first class is free.", primaryCta: { label: "Book a visit", href: "#contact" } },
}`,
  imports: ['import "@marktiderman/genesis-sites/sections"'],
  id: 'sites-section-cta',
  metadata: { nestable: false },
}
