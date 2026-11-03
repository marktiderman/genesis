// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=72-384
// source=packages/ui/src/navigation.tsx
// component=DefaultLink
import figma from 'figma'
const instance = figma.selectedInstance

const label = instance.getString('Label')

export default {
  example: figma.code`<DefaultLink href={href}>${label}</DefaultLink>`,
  imports: ['import { DefaultLink } from "@marktiderman/genesis-ui"'],
  id: 'default-link',
  metadata: { nestable: true },
}
