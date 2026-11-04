// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=101-210
// source=packages/chat/src/native/moderation.tsx
// component=ModerationMarker
import figma from 'figma'
const instance = figma.selectedInstance
const mine = instance.getEnum('mine', { false: false, true: true })
// note = moderationNote(message, { mine, observer }) in the row; null when nothing to show.

export default {
  example: figma.code`{note ? <ModerationMarker note={note} mine={${mine ? 'true' : 'false'}} /> : null}`,
  imports: ['import { ModerationMarker } from "@marktiderman/genesis-chat/native"'],
  id: 'chat-native-moderation-marker',
  metadata: { nestable: true },
}
