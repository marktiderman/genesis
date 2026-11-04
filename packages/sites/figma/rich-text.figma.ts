// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=136-305
// source=packages/sites/src/sections/rich-text.tsx
// component=rich-text
import figma from 'figma'
const instance = figma.selectedInstance
const variant = instance.getEnum('variant', { "narrow": "narrow", "wide": "wide" })
export default {
  example: figma.code`{
  id: "rich-text",
  type: "rich-text",
  v: 1,
  variant: "${variant}",
  props: { heading: "Our story", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "We opened in a railway arch…" }] }] } },
}`,
  imports: ['import "@marktiderman/genesis-sites/sections"'],
  id: 'sites-section-rich-text',
  metadata: { nestable: false },
}
