// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=8-82
// source=packages/ui-native/src/components/empty-state.tsx
// component=NativeEmptyState
import figma from 'figma'
const instance = figma.selectedInstance

const title = instance.getString('Title')
const description = instance.getString('Description')
const showAction = instance.getBoolean('Show action')
const variant = instance.getEnum('variant', { 'first-run': 'first-run', 'no-results': 'no-results', error: 'error' })

export default {
  example: figma.code`<NativeEmptyState
  variant="${variant}"
  title="${title}"${description ? figma.code`
  description="${description}"` : ''}${showAction ? '\n  primaryAction={<NativeButton onPress={() => {}}>Action</NativeButton>}' : ''}
/>`,
  imports: ['import { NativeEmptyState, NativeButton } from "@marktiderman/genesis-ui-native"'],
  id: 'native-empty-state',
  metadata: { nestable: true },
}
