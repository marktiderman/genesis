// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=76-56
// source=packages/ui/src/components/layout/builder-layout.tsx
// component=BuilderLayout
import figma from 'figma'
const instance = figma.selectedInstance

const previewHidden = instance.getEnum('previewHidden', { false: 'false', true: 'true' })

export default {
  example: figma.code`<BuilderLayout
  outline={outline}
  editor={editor}
  preview={preview}
  previewHidden={${previewHidden}}
/>`,
  imports: ['import { BuilderLayout } from "@marktiderman/genesis-ui/layout"'],
  id: 'builder-layout',
  metadata: { nestable: false },
}
