// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=64-71
// source=packages/ui/src/components/ui/dialog.tsx
// component=Dialog
import figma from 'figma'
const instance = figma.selectedInstance

const mobileLayout = instance.getEnum('mobileLayout', { center: 'center', sheet: 'sheet', fullscreen: 'fullscreen' })
const title = instance.getString('Title')
const description = instance.getString('Description')
const showFooter = instance.getBoolean('Show footer')
const showBody = instance.getBoolean('Show body')
const showBodySlot = instance.getBoolean('Show body slot')

export default {
  example: figma.code`<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent mobileLayout="${mobileLayout}">
    <DialogHeader>
      <DialogTitle>${title}</DialogTitle>
      <DialogDescription>${description}</DialogDescription>
    </DialogHeader>${showBody || showBodySlot ? `
    {children}` : ''}${showFooter ? `
    <DialogFooter>
      <Button onClick={() => setOpen(false)}>Done</Button>
    </DialogFooter>` : ''}
  </DialogContent>
</Dialog>`,
  imports: ['import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@marktiderman/genesis-ui"'],
  id: 'dialog',
  metadata: { nestable: false },
}
