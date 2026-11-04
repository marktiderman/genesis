// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=106-227
// source=packages/chat/src/web/video.tsx
// component=ChatVideoPlayer
import figma from 'figma'
const instance = figma.selectedInstance
const state = instance.getEnum('state', { ready: 'ready', processing: 'processing', uploading: 'uploading', failed: 'failed' })

export default {
  example: figma.code`<ChatVideoPlayer src={url} playbackId={attachment.playbackId}${state === 'processing' ? ' processing' : ''}${state === 'uploading' ? ' uploading' : ''}${state === 'failed' ? ' failed' : ''} />`,
  imports: ['import { ChatVideoPlayer } from "@marktiderman/genesis-chat/web"'],
  id: 'chat-web-chat-video-player',
  metadata: { nestable: true },
}
