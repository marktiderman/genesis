// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=133-36
// source=packages/sites/src/sections/shared.tsx
// component=SectionTitle
import figma from 'figma'
const instance = figma.selectedInstance
const size = instance.getEnum('size', { "xl": "xl", "lg": "lg", "md": "md", "sm": "sm" })
const title = instance.getString('Title')
export default {
  example: figma.code`<SectionTitle ctx={ctx} id={titleId(ctx)} size="${size}">${title}</SectionTitle>`,
  imports: ['import { SectionTitle } from "@marktiderman/genesis-sites/sections"'],
  id: 'sites-section-title',
  metadata: { nestable: true },
}
