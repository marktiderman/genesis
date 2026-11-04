// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=133-27
// source=packages/sites/src/sections/shared.tsx
// component=SectionBand
import figma from 'figma'
const instance = figma.selectedInstance
const surface = instance.getEnum('surface', { "base": "base", "muted": "muted", "inverse": "inverse", "accent": "accent" })
const spacing = instance.getEnum('spacing', { "md": "md", "lg": "lg" })
export default {
  example: figma.code`<SectionBand node={node} ctx={ctx} anchor={props.anchor} surface="${surface}" spacing="${spacing}">
  {children}
</SectionBand>`,
  imports: ['import { SectionBand } from "@marktiderman/genesis-sites/sections"'],
  id: 'sites-section-band',
  metadata: { nestable: true },
}
