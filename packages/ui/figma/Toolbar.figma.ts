// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=70-83
// source=packages/ui/src/components/ui/toolbar.tsx
// component=Toolbar
// The Figma set has no properties; the example shows the parts a toolbar is made of.
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<Toolbar>
  <ToolbarButton>{action}</ToolbarButton>
  <ToolbarSeparator />
  <ToolbarButton>{action}</ToolbarButton>
</Toolbar>`,
  imports: ['import { Toolbar, ToolbarButton, ToolbarSeparator } from "@marktiderman/genesis-ui"'],
  id: 'toolbar',
  metadata: { nestable: true },
}
