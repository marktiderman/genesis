// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=63-556
// source=packages/ui/src/components/data/ConfirmDeleteDialog.tsx
// component=ConfirmDeleteDialog
import figma from 'figma'
const instance = figma.selectedInstance

const kind = instance.getEnum('kind', { permanent: 'permanent', recycle: 'recycle' })
const title = instance.getString('Title')

export default {
  example: figma.code`<ConfirmDeleteDialog
  open={open}
  onOpenChange={setOpen}
  onConfirm={handleDelete}
  kind="${kind}"
  title="${title}"
/>`,
  imports: ['import { ConfirmDeleteDialog } from "@marktiderman/genesis-ui/data"'],
  id: 'confirm-delete-dialog',
  metadata: { nestable: false },
}
