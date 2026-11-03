// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=67-90
// source=packages/ui/src/components/ui/command-palette.tsx
// component=CommandPalette
// The Figma set has no properties: the palette's rows come from `commands`.
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<CommandPalette open={open} onOpenChange={setOpen} commands={commands} />`,
  imports: ['import { CommandPalette } from "@marktiderman/genesis-ui"'],
  id: 'command-palette',
  metadata: { nestable: false },
}
