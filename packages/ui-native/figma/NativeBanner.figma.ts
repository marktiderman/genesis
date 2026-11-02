// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=8-146
// source=packages/ui-native/src/components/inline-alert.tsx
// component=NativeBanner
import figma from 'figma'
const instance = figma.selectedInstance

const title = instance.getString('Title')
const description = instance.getString('Description')
const variant = instance.getEnum('variant', { info: 'info', success: 'success', warning: 'warning', destructive: 'destructive' })

export default {
  example: figma.code`<NativeBanner variant="${variant}" title="${title}"${description ? figma.code` description="${description}"` : ''} />`,
  imports: ['import { NativeBanner } from "@marktiderman/genesis-ui-native"'],
  id: 'native-banner',
  metadata: { nestable: true },
}
