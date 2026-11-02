// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=14-48
// source=packages/ui-native/src/components/sheet.tsx
// component=NativeSheet
// NativeSheet is a container: the title and description layers become its children. The
// "detent" variant drives snapPoints. "Show grabber", "Show footer" and "Show secondary"
// have no prop (the grabber is always drawn; a footer is whatever children the caller adds).
import figma from 'figma'
const instance = figma.selectedInstance

const title = instance.getString('Title')
const description = instance.getString('Description')
const snapPoints = instance.getEnum('detent', { medium: "['50%']", large: "['90%']" })

export default {
  example: figma.code`<NativeSheet open={open} onOpenChange={setOpen} snapPoints={${snapPoints}}>
  <NativeText preset="h3">${title}</NativeText>${description ? figma.code`
  <NativeText preset="body-sm">${description}</NativeText>` : ''}
  {children}
</NativeSheet>`,
  imports: ['import { NativeSheet, NativeText } from "@marktiderman/genesis-ui-native"'],
  id: 'native-sheet',
  metadata: { nestable: false },
}
