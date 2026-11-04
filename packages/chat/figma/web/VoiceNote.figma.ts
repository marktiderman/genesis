// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=105-75
// source=packages/chat/src/web/voice-note.tsx
// component=VoiceNote
import figma from 'figma'
const instance = figma.selectedInstance
const tone = instance.getEnum('tone', { default: 'default', primary: 'primary' })
const showTranscript = instance.getBoolean('Show transcript')

export default {
  example: figma.code`<VoiceNote
  src={url}
  durationMs={attachment.durationMs}
  waveform={attachment.waveform}${showTranscript ? '\n  transcript={attachment.transcript}\n  transcriptStatus={attachment.transcriptStatus}' : ''}${tone === 'primary' ? '\n  tone="primary"' : ''}
/>`,
  imports: ['import { VoiceNote } from "@marktiderman/genesis-chat/web"'],
  id: 'chat-web-voice-note',
  metadata: { nestable: true },
}
