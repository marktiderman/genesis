// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=103-131
// source=packages/chat/src/native/video-player.tsx
// component=ChatVideoPlayer
import figma from 'figma'
const instance = figma.selectedInstance
const status = instance.getEnum('status', { ready: 'ready', processing: 'pending', uploading: 'pending', failed: 'failed' })
const uploading = instance.getEnum('status', { ready: false, processing: false, uploading: true, failed: false })

export default {
  example: figma.code`<ChatVideoPlayer
  id={attachment.id}
  uri={url}
  playbackId={attachment.playbackId}
  status="${status}"
  durationMs={attachment.durationMs}${uploading ? '\n  uploading' : ''}
/>`,
  imports: ['import { ChatVideoPlayer } from "@marktiderman/genesis-chat/native"'],
  id: 'chat-native-chat-video-player',
  metadata: { nestable: true },
}
