// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=74-40
// source=packages/ui/src/components/resource/ResponsesToolbar.tsx
// component=ResponsesToolbar
// Count is the number of responses the app shows beside the toggle (in `filters` or `actions`),
// so it is not mapped.
import figma from 'figma'
const instance = figma.selectedInstance

const view = instance.getEnum('view', { summary: 'summary', each: 'each' })

export default {
  example: figma.code`<ResponsesToolbar view="${view}" onViewChange={setView} />`,
  imports: ['import { ResponsesToolbar } from "@marktiderman/genesis-ui/resource"'],
  id: 'responses-toolbar',
  metadata: { nestable: true },
}
