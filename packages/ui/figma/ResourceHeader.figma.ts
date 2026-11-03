// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=59-792
// source=packages/ui/src/components/resource/ResourceHeader.tsx
// component=ResourceHeader
import figma from 'figma'
const instance = figma.selectedInstance

const saveState = instance.getEnum('saveState', {
  saved: 'saved',
  saving: 'saving',
  unsaved: 'unsaved',
  failed: 'failed',
  stopped: 'stopped',
  conflict: 'conflict',
})
const title = instance.getString('Title')
const showChips = instance.getBoolean('Show chips')

export default {
  example: figma.code`<ResourceHeader
  title="${title}"
  saveState="${saveState}"${showChips ? figma.code`
  chips={chips}` : ''}
/>`,
  imports: ['import { ResourceHeader } from "@marktiderman/genesis-ui"'],
  id: 'resource-header',
  metadata: { nestable: false },
}
