// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=14-48
// source=packages/ui-native/src/components/sheet.tsx
// component=NativeSheet
// NativeSheet is a container: the title and description layers become its children. The
// "detent" variant drives snapPoints. "Show grabber", "Show footer" and "Show secondary"
// have no prop. `Content` is the component the sheet holds. `onDismissed` (after the sheet
// has gone) has no layer (the grabber is always drawn; a footer is whatever children the caller adds).
import figma from 'figma'
const instance = figma.selectedInstance

const title = instance.getString('Title')
const description = instance.getString('Description')
const contentSwap = instance.getInstanceSwap('Content')
// A swap is an instance handle; its own template renders the code that goes in the sheet.
let content
if (contentSwap && contentSwap.type === 'INSTANCE') content = contentSwap.executeTemplate().example
const snapPoints = instance.getEnum('detent', { medium: "['50%']", large: "['90%']" })

export default {
  example: figma.code`<NativeSheet open={open} onOpenChange={setOpen} snapPoints={${snapPoints}}>
  <NativeText preset="h3">${title}</NativeText>${description ? figma.code`
  <NativeText preset="body-sm">${description}</NativeText>` : ''}
  ${content ?? '{children}'}
</NativeSheet>`,
  imports: ['import { NativeSheet, NativeText } from "@marktiderman/genesis-ui-native"'],
  id: 'native-sheet',
  metadata: { nestable: false },
}
