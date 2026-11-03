// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=64-178
// source=packages/ui/src/components/ui/alert-dialog.tsx
// component=AlertDialog
import figma from 'figma'
const instance = figma.selectedInstance

const title = instance.getString('Title')
const description = instance.getString('Description')

export default {
  example: figma.code`<AlertDialog open={open} onOpenChange={setOpen}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>${title}</AlertDialogTitle>
      <AlertDialogDescription>${description}</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={handleConfirm}>Continue</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>`,
  imports: ['import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@marktiderman/genesis-ui"'],
  id: 'alert-dialog',
  metadata: { nestable: false },
}
