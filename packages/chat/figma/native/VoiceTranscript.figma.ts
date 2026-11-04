// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=100-150
// source=packages/chat/src/native/media.tsx
// component=VoiceTranscript
import figma from 'figma'
const instance = figma.selectedInstance
const mine = instance.getEnum('mine', { false: false, true: true })
const status = instance.getEnum('status', { done: 'done', pending: 'pending' })

export default {
  example: figma.code`<VoiceTranscript transcript={attachment.transcript} status="${status}" mine={${mine ? 'true' : 'false'}} testID="chat-transcript" />`,
  imports: ['import { VoiceTranscript } from "@marktiderman/genesis-chat/native"'],
  id: 'chat-native-voice-transcript',
  metadata: { nestable: true },
}
