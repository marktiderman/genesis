// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=6-63
// source=packages/ui-native/src/components/header-card.tsx
// component=NativeHeaderCard
import figma from 'figma'
const instance = figma.selectedInstance

const title = instance.getString('Title')
const description = instance.getString('Subtitle')
const showBody = instance.getBoolean('Show body')
const showAction = instance.getBoolean('Show action')

export default {
  example: figma.code`<NativeHeaderCard
  title="${title}"${description ? figma.code`
  description="${description}"` : ''}${showBody ? '\n  body={<NativeText>{body}</NativeText>}' : ''}${showAction ? '\n  footer={<NativeButton onPress={() => {}}>Action</NativeButton>}' : ''}
/>`,
  imports: ['import { NativeHeaderCard, NativeText, NativeButton } from "@marktiderman/genesis-ui-native"'],
  id: 'native-header-card',
  metadata: { nestable: true },
}
