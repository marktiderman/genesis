// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=101-197
// source=packages/chat/src/native/icon-button.tsx
// component=ChatIconButton
import figma from 'figma'
const instance = figma.selectedInstance
const disabled = instance.getEnum('disabled', { false: false, true: true })

export default {
  example: figma.code`<ChatIconButton icon="mic" label="Record a voice note" onPress={record}${disabled ? ' disabled' : ''} />`,
  imports: ['import { ChatIconButton } from "@marktiderman/genesis-chat/native"'],
  id: 'chat-native-chat-icon-button',
  metadata: { nestable: true },
}
