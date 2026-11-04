// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=135-414
// source=packages/sites/src/sections/faq.tsx
// component=faq
import figma from 'figma'
const instance = figma.selectedInstance
const variant = instance.getEnum('variant', { "accordion": "accordion", "list": "list" })
export default {
  example: figma.code`{
  id: "faq",
  type: "faq",
  v: 1,
  variant: "${variant}",
  props: { heading: "Questions people ask", items: [{ question: "What should I bring?", answer: "Water and trainers." }] },
}`,
  imports: ['import "@marktiderman/genesis-sites/sections"'],
  id: 'sites-section-faq',
  metadata: { nestable: false },
}
