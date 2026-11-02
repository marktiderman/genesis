// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=8-114
// source=packages/ui-native/src/components/inline-alert.tsx
// component=NativeInlineAlert
import figma from 'figma'
const instance = figma.selectedInstance

const title = instance.getString('Title')
const description = instance.getString('Description')
const variant = instance.getEnum('variant', { info: 'info', success: 'success', warning: 'warning', destructive: 'destructive' })

export default {
  example: figma.code`<NativeInlineAlert variant="${variant}" title="${title}"${description ? figma.code` description="${description}"` : ''} />`,
  imports: ['import { NativeInlineAlert } from "@marktiderman/genesis-ui-native"'],
  id: 'native-inline-alert',
  metadata: { nestable: true },
}
