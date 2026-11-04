// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=133-109
// source=packages/sites/src/sections/shared.tsx
// component=SiteImage
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<SiteImage image={image} ctx={ctx} sizes="(min-width: 768px) 50vw, 100vw" />`,
  imports: ['import { SiteImage } from "@marktiderman/genesis-sites/sections"'],
  id: 'sites-site-image',
  metadata: { nestable: true },
}
