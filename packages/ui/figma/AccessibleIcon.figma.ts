// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=72-389
// source=packages/ui/src/components/ui/accessible-icon.tsx
// component=AccessibleIcon
// Icon swap is the glyph; Note is the Figma-only caption for the label, which is the icon's accessible name.
import figma from 'figma'
const instance = figma.selectedInstance

const showIcon = instance.getInstanceSwap('Icon swap')
let iconCode = '<Icon />'
if (showIcon && showIcon.type === 'INSTANCE') {
  iconCode = showIcon.executeTemplate().example
}
const note = instance.getString('Note')

export default {
  example: figma.code`<AccessibleIcon label="${note}">
  ${iconCode}
</AccessibleIcon>`,
  imports: ['import { AccessibleIcon } from "@marktiderman/genesis-ui"'],
  id: 'accessible-icon',
  metadata: { nestable: true },
}
