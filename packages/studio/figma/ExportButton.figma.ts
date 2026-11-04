// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=129-120
// source=packages/studio/src/toolbar/Toolbar.tsx
// component=ExportButton
import figma from 'figma'

export default {
  example: figma.code`<ExportButton onExport={onExport} busy={false} progress={0} />`,
  imports: ['import { ExportButton } from "@marktiderman/genesis-studio"'],
  id: 'studio-export-button',
  metadata: { nestable: true },
}
