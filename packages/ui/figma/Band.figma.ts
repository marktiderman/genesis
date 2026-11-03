// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=76-366
// source=packages/ui/src/components/layout/band.tsx
// component=Band
import figma from 'figma'
const instance = figma.selectedInstance

const surface = instance.getEnum('surface', { base: 'base', muted: 'muted', accent: 'accent', inverse: 'inverse' })
const spacing = instance.getEnum('spacing', { sm: 'sm', md: 'md', lg: 'lg' })
const title = instance.getString('Title')
const lead = instance.getString('Lead')

export default {
  example: figma.code`<Band surface="${surface}" spacing="${spacing}">
  <Display>${title}</Display>
  <BandLead>${lead}</BandLead>
</Band>`,
  imports: ['import { Band, BandLead, Display } from "@marktiderman/genesis-ui/layout"'],
  id: 'band',
  metadata: { nestable: true },
}
