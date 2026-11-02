// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=8-197
// source=packages/ui-native/src/components/loading-state.tsx
// component=NativeLoadingState
import figma from 'figma'
const instance = figma.selectedInstance

const showMessage = instance.getBoolean('Show message')
const label = showMessage ? instance.getString('Message') : undefined

export default {
  example: figma.code`<NativeLoadingState${label ? figma.code` label="${label}"` : ''} />`,
  imports: ['import { NativeLoadingState } from "@marktiderman/genesis-ui-native"'],
  id: 'native-loading-state',
  metadata: { nestable: true },
}
