// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=115-1284
// source=packages/native/src/push/screens.tsx
// component=PushPromptSheet
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<PushPromptSheet
  reason={reason}
  accept={accept}
  decline={decline}
  title="${instance.getString('Title')}"
  body="${instance.getString('Body')}"
/>`,
  imports: ['import { PushPromptSheet } from "@marktiderman/genesis-native/push"'],
  id: 'native-push-prompt-sheet',
  metadata: { nestable: false },
}
