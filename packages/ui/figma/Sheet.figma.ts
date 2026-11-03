// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=64-158
// source=packages/ui/src/components/ui/sheet.tsx
// component=Sheet
import figma from 'figma'
const instance = figma.selectedInstance

const side = instance.getEnum('side', { right: 'right', left: 'left', top: 'top', bottom: 'bottom' })
const title = instance.getString('Title')
const description = instance.getString('Description')
const showFooter = instance.getBoolean('Show footer')

export default {
  example: figma.code`<Sheet open={open} onOpenChange={setOpen}>
  <SheetContent side="${side}">
    <SheetHeader>
      <SheetTitle>${title}</SheetTitle>
      <SheetDescription>${description}</SheetDescription>
    </SheetHeader>${showFooter ? `
    <SheetFooter>
      <Button onClick={() => setOpen(false)}>Done</Button>
    </SheetFooter>` : ''}
  </SheetContent>
</Sheet>`,
  imports: ['import { Button, Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@marktiderman/genesis-ui"'],
  id: 'sheet',
  metadata: { nestable: false },
}
