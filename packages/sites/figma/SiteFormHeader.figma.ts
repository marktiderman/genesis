// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=133-110
// source=packages/sites/src/sections/form-header.tsx
// component=SiteFormHeader
import figma from 'figma'
const instance = figma.selectedInstance
const title = instance.getString('Title')
const description = instance.getString('Description')
export default {
  example: figma.code`<SiteFormHeader title="${title}" description="${description}" />`,
  imports: ['import { SiteFormHeader } from "@marktiderman/genesis-sites/sections"'],
  id: 'sites-site-form-header',
  metadata: { nestable: true },
}
