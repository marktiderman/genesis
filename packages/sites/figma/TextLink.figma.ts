// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=133-92
// source=packages/sites/src/sections/shared.tsx
// component=TextLink
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<TextLink link={link} ctx={ctx} />`,
  imports: ['import { TextLink } from "@marktiderman/genesis-sites/sections"'],
  id: 'sites-text-link',
  metadata: { nestable: true },
}
