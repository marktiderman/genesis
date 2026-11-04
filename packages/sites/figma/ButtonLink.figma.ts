// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=133-91
// source=packages/sites/src/sections/shared.tsx
// component=ButtonLink
import figma from 'figma'
const instance = figma.selectedInstance
const tone = instance.getEnum('tone', { "primary": "primary", "secondary": "secondary", "outline": "outline", "inverse": "inverse", "ghost": "ghost" })
export default {
  example: figma.code`<ButtonLink link={link} ctx={ctx} tone="${tone}" />`,
  imports: ['import { ButtonLink } from "@marktiderman/genesis-sites/sections"'],
  id: 'sites-button-link',
  metadata: { nestable: true },
}
