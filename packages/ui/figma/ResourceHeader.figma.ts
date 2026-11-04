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
// Record mode: hide the save state and history (a record page, not an editor); Share and
// Publish map to onShare and publish.
const showSaveState = instance.getBoolean('Show save state')
const showHistory = instance.getBoolean('Show history')
const showShare = instance.getBoolean('Show share')
const showPublish = instance.getBoolean('Show publish')

export default {
  example: figma.code`<ResourceHeader
  title="${title}"${showSaveState ? `\n  saveState="${saveState}"` : ''}${showChips ? figma.code`
  chips={chips}` : ''}${showHistory ? '\n  onUndo={undo}\n  onRedo={redo}\n  canUndo={canUndo}\n  canRedo={canRedo}' : ''}${showShare ? '\n  onShare={share}' : ''}${showPublish ? '\n  publish={{ onClick: publish }}' : ''}
/>`,
  imports: ['import { ResourceHeader } from "@marktiderman/genesis-ui"'],
  id: 'resource-header',
  metadata: { nestable: false },
}
