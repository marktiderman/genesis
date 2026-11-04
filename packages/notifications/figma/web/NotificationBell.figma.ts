// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=115-2829
// source=packages/notifications/src/web/index.tsx
// component=NotificationBell
import figma from 'figma'

export default {
  example: figma.code`<NotificationBell onOpen={(item) => item.url && navigate(item.url)} onSeeAll={() => navigate("/notifications")} />`,
  imports: ['import { NotificationBell } from "@marktiderman/genesis-notifications/web"'],
  id: 'notifications-web-notification-bell',
  metadata: { nestable: true },
}
