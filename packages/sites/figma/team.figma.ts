// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=136-571
// source=packages/sites/src/sections/team.tsx
// component=team
import figma from 'figma'
const instance = figma.selectedInstance
const variant = instance.getEnum('variant', { "cards": "cards", "list": "list" })
export default {
  example: figma.code`{
  id: "team",
  type: "team",
  v: 1,
  variant: "${variant}",
  props: { heading: "Our team", members: [{ name: "Sam Rivera", role: "Founder" }] },
}`,
  imports: ['import "@marktiderman/genesis-sites/sections"'],
  id: 'sites-section-team',
  metadata: { nestable: false },
}
