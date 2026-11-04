// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=136-428
// source=packages/sites/src/sections/footer.tsx
// component=footer
import figma from 'figma'
const instance = figma.selectedInstance
const variant = instance.getEnum('variant', { "simple": "simple", "columns": "columns", "minimal": "minimal" })
export default {
  example: figma.code`{
  id: "footer",
  type: "footer",
  v: 1,
  variant: "${variant}",
  props: { links: [{ label: "Contact", href: "/contact" }], copyright: "© Acme Works" },
}`,
  imports: ['import "@marktiderman/genesis-sites/sections"'],
  id: 'sites-section-footer',
  metadata: { nestable: false },
}
