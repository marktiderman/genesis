// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=106-118
// source=packages/chat/src/web/topics.tsx
// component=ChatTopicBar
import figma from 'figma'
const instance = figma.selectedInstance
const canManage = instance.getEnum('canManage', { false: false, true: true })

export default {
  example: figma.code`<ChatTopicBar topics={topics} value={topic} onValueChange={setTopic}${canManage ? ' canManage onSetTopic={setTopicState}' : ''} />`,
  imports: ['import { ChatTopicBar } from "@marktiderman/genesis-chat/web"'],
  id: 'chat-web-chat-topic-bar',
  metadata: { nestable: false },
}
