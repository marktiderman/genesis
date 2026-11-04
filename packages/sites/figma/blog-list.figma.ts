// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=136-651
// source=packages/sites/src/sections/blog-list.tsx
// component=blog-list
import figma from 'figma'
const instance = figma.selectedInstance
const variant = instance.getEnum('variant', { "grid": "grid", "list": "list" })
export default {
  example: figma.code`{
  id: "blog-list",
  type: "blog-list",
  v: 1,
  variant: "${variant}",
  props: { heading: "Latest posts", showExcerpt: true, showDate: true },
}`,
  imports: ['import "@marktiderman/genesis-sites/sections"'],
  id: 'sites-section-blog-list',
  metadata: { nestable: false },
}
