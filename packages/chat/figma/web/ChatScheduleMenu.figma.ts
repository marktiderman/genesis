// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=106-142
// source=packages/chat/src/web/schedule.tsx
// component=ChatScheduleMenu
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<ChatScheduleMenu onSchedule={scheduleAt} />`,
  imports: ['import { ChatScheduleMenu } from "@marktiderman/genesis-chat/web"'],
  id: 'chat-web-chat-schedule-menu',
  metadata: { nestable: true },
}
