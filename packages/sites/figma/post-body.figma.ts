// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=136-674
// source=packages/sites/src/sections/post-body.tsx
// component=post-body
import figma from 'figma'
const instance = figma.selectedInstance
const variant = instance.getEnum('variant', { "article": "article", "cover": "cover" })
export default {
  example: figma.code`{
  id: "post-body",
  type: "post-body",
  v: 1,
  variant: "${variant}",
  props: { showCover: true, showAuthor: true, showDate: true },
}`,
  imports: ['import "@marktiderman/genesis-sites/sections"'],
  id: 'sites-section-post-body',
  metadata: { nestable: false },
}
