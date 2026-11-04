// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=135-78
// source=packages/sites/src/sections/nav.tsx
// component=nav
import figma from 'figma'
const instance = figma.selectedInstance
const variant = instance.getEnum('variant', { "simple": "simple", "centered": "centered", "minimal": "minimal" })
export default {
  example: figma.code`{
  id: "nav",
  type: "nav",
  v: 1,
  variant: "${variant}",
  props: { showName: true, cta: { label: "Get started", href: "#contact" } },
}`,
  imports: ['import "@marktiderman/genesis-sites/sections"'],
  id: 'sites-section-nav',
  metadata: { nestable: false },
}
