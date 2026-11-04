// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=103-300
// source=packages/chat/src/native/topics.tsx
// component=ChatTopicBar
import figma from 'figma'
const instance = figma.selectedInstance
const canManage = instance.getEnum('canManage', { false: false, true: true })

export default {
  example: figma.code`<ChatTopicBar topics={topics} value={topic} onValueChange={setTopic}${canManage ? ' canManage onSetTopic={setTopicState}' : ''} />`,
  imports: ['import { ChatTopicBar } from "@marktiderman/genesis-chat/native"'],
  id: 'chat-native-chat-topic-bar',
  metadata: { nestable: false },
}
