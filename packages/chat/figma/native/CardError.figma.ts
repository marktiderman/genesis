// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=101-225
// source=packages/chat/src/native/attachment-cards.tsx
// component=CardError
import figma from 'figma'
const instance = figma.selectedInstance
const text = instance.getString('Text')
const mine = instance.getEnum('mine', { false: false, true: true })

export default {
  example: figma.code`<CardError text="${text}" mine={${mine ? 'true' : 'false'}} />`,
  imports: ['import { CardError } from "@marktiderman/genesis-chat/native"'],
  id: 'chat-native-card-error',
  metadata: { nestable: true },
}
