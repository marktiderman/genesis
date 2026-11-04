// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=100-141
// source=packages/chat/src/native/voice-player.tsx
// component=VoiceNotePlayer
import figma from 'figma'
const instance = figma.selectedInstance
const mine = instance.getEnum('mine', { false: false, true: true })

export default {
  example: figma.code`<VoiceNotePlayer id={attachment.id} uri={url} durationMs={attachment.durationMs} waveform={attachment.waveform}${mine ? ' mine' : ''} />`,
  imports: ['import { VoiceNotePlayer } from "@marktiderman/genesis-chat/native"'],
  id: 'chat-native-voice-note-player',
  metadata: { nestable: true },
}
