// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=14-91
// source=packages/ui-native/src/components/dialog.tsx
// component=NativeDialog
// The dialog's Cancel and Confirm buttons are exposed NativeButton instances, resolved
// through their own template. The "variant" (default | destructive) lives on the confirm
// button in Figma and in code, so it is not a NativeDialog prop.
import figma from 'figma'
const instance = figma.selectedInstance

const title = instance.getString('Title')
const description = instance.getString('Description')
const showCancel = instance.getBoolean('Show cancel')

const cancel = showCancel ? instance.findInstance('Cancel') : null
let cancelCode
if (cancel && cancel.type === 'INSTANCE') {
  cancelCode = cancel.executeTemplate().example
}
const confirm = instance.findInstance('Confirm')
let confirmCode
if (confirm && confirm.type === 'INSTANCE') {
  confirmCode = confirm.executeTemplate().example
}

export default {
  example: figma.code`<NativeDialog open={open} onOpenChange={setOpen}>
  <NativeDialogContent>
    <NativeDialogHeader>
      <NativeDialogTitle>${title}</NativeDialogTitle>${description ? figma.code`
      <NativeDialogDescription>${description}</NativeDialogDescription>` : ''}
    </NativeDialogHeader>
    <NativeDialogFooter>${cancelCode ? figma.code`
      ${cancelCode}` : ''}${confirmCode ? figma.code`
      ${confirmCode}` : ''}
    </NativeDialogFooter>
  </NativeDialogContent>
</NativeDialog>`,
  imports: [
    'import { NativeDialog, NativeDialogContent, NativeDialogHeader, NativeDialogTitle, NativeDialogDescription, NativeDialogFooter } from "@marktiderman/genesis-ui-native"',
  ],
  id: 'native-dialog',
  metadata: { nestable: false },
}
