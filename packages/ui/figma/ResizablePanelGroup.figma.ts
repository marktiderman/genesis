// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=71-198
// source=packages/ui/src/components/ui/resizable.tsx
// component=ResizablePanelGroup
import figma from 'figma'
const instance = figma.selectedInstance

const direction = instance.getEnum('direction', { horizontal: 'horizontal', vertical: 'vertical' })
const panel1 = instance.getString('Panel 1')
const panel2 = instance.getString('Panel 2')

export default {
  example: figma.code`<ResizablePanelGroup direction="${direction}">
  <ResizablePanel defaultSize={50}>${panel1}</ResizablePanel>
  <ResizableHandle withHandle />
  <ResizablePanel defaultSize={50}>${panel2}</ResizablePanel>
</ResizablePanelGroup>`,
  imports: ['import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@marktiderman/genesis-ui"'],
  id: 'resizable-panel-group',
  metadata: { nestable: true },
}
