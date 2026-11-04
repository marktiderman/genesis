// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=103-166
// source=packages/chat/src/native/video-recorder.tsx
// component=ChatVideoRecorder
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<ChatVideoRecorder open={recording} onClose={() => setRecording(false)} limitMs={60_000} onRecorded={sendVideo} />`,
  imports: ['import { ChatVideoRecorder } from "@marktiderman/genesis-chat/native"'],
  id: 'chat-native-chat-video-recorder',
  metadata: { nestable: false },
}
