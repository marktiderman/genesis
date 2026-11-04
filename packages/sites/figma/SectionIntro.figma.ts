// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=133-45
// source=packages/sites/src/sections/shared.tsx
// component=SectionIntro
import figma from 'figma'
const instance = figma.selectedInstance
const align = instance.getEnum('align', { "center": "center", "left": "left" })
export default {
  example: figma.code`<SectionIntro ctx={ctx} eyebrow={props.eyebrow} heading={props.heading} body={props.body} align="${align}" />`,
  imports: ['import { SectionIntro } from "@marktiderman/genesis-sites/sections"'],
  id: 'sites-section-intro',
  metadata: { nestable: true },
}
