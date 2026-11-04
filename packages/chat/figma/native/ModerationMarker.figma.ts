// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=101-210
// source=packages/chat/src/native/moderation.tsx
// component=ModerationMarker
import figma from 'figma'
const instance = figma.selectedInstance
const mine = instance.getEnum('mine', { false: false, true: true })

export default {
  example: figma.code`<ModerationMarker note={moderationNote(message)} mine={${mine ? 'true' : 'false'}} />`,
  imports: ['import { ModerationMarker } from "@marktiderman/genesis-chat/native"'],
  id: 'chat-native-moderation-marker',
  metadata: { nestable: true },
}
