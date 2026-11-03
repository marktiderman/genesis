// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=70-250
// source=packages/ui/src/components/ui/collapsible.tsx
// component=Collapsible
// The open=false|true property is an interaction state and is not emitted.
import figma from 'figma'
const instance = figma.selectedInstance

const trigger = instance.getString('Trigger')

export default {
  example: figma.code`<Collapsible>
  <CollapsibleTrigger>${trigger}</CollapsibleTrigger>
  <CollapsibleContent>{children}</CollapsibleContent>
</Collapsible>`,
  imports: ['import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@marktiderman/genesis-ui"'],
  id: 'collapsible',
  metadata: { nestable: true },
}
