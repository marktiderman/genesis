// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=8-146
// source=packages/ui-native/src/components/inline-alert.tsx
// component=NativeBanner
import figma from 'figma'
const instance = figma.selectedInstance

const title = instance.getString('Title')
const description = instance.getString('Description')
const showContent = instance.getBoolean('Show content')
const showActions = instance.getBoolean('Show actions')
const variant = instance.getEnum('variant', { info: 'info', success: 'success', warning: 'warning', destructive: 'destructive' })

export default {
  example: figma.code`<NativeBanner variant="${variant}" title="${title}"${description ? figma.code` description="${description}"` : ''}${showActions ? figma.code` actions={<NativeButton size="sm" variant="outline" onPress={retry}>Try again</NativeButton>}` : ''}${showContent ? figma.code`>
  {content}
</NativeBanner>` : ' />'}`,
  imports: [`import { NativeBanner${showActions ? ', NativeButton' : ''} } from "@marktiderman/genesis-ui-native"`],
  id: 'native-banner',
  metadata: { nestable: true },
}
