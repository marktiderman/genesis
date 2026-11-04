// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=101-59
// source=packages/chat/src/native/message-actions-sheet.tsx
// component=MessageActionsSheet
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<MessageActionsSheet
  message={selected}
  context={actionContext}
  onClose={close}
  onReact={react}
  onAction={runAction}
/>`,
  imports: ['import { MessageActionsSheet } from "@marktiderman/genesis-chat/native"'],
  id: 'chat-native-message-actions-sheet',
  metadata: { nestable: false },
}
