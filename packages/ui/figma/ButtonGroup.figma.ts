// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=70-110
// source=packages/ui/src/components/ui/button-group.tsx
// component=ButtonGroup
import figma from 'figma'
const instance = figma.selectedInstance

const orientation = instance.getEnum('orientation', { horizontal: 'horizontal', vertical: 'vertical' })

export default {
  example: figma.code`<ButtonGroup orientation="${orientation}">
  {buttons}
</ButtonGroup>`,
  imports: ['import { ButtonGroup } from "@marktiderman/genesis-ui"'],
  id: 'button-group',
  metadata: { nestable: true },
}
