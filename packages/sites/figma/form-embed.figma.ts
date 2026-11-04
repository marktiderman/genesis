// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=136-388
// source=packages/sites/src/sections/form-embed.tsx
// component=form-embed
import figma from 'figma'
const instance = figma.selectedInstance
const variant = instance.getEnum('variant', { "card": "card", "split": "split" })
export default {
  example: figma.code`{
  id: "form-embed",
  type: "form-embed",
  v: 1,
  variant: "${variant}",
  props: { heading: "Book a free visit", form: "free-visit" },
}`,
  imports: ['import "@marktiderman/genesis-sites/sections"'],
  id: 'sites-section-form-embed',
  metadata: { nestable: false },
}
