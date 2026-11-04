// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=136-897
// source=packages/sites/src/sections/file.tsx
// component=file
import figma from 'figma'
const instance = figma.selectedInstance
const variant = instance.getEnum('variant', { "list": "list", "cards": "cards" })
export default {
  example: figma.code`{
  id: "file",
  type: "file",
  v: 1,
  variant: "${variant}",
  props: { heading: "Forms and documents", files: [] },
}`,
  imports: ['import "@marktiderman/genesis-sites/sections"'],
  id: 'sites-section-file',
  metadata: { nestable: false },
}
