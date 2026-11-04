// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=121-89
// source=packages/forms-native/src/slots.tsx
// component=DefaultStatus
import figma from 'figma'
const instance = figma.selectedInstance
const status = instance.getEnum('status', { "waiting": "waiting", "sending": "sending", "sent": "sent", "failed": "failed", "discarded": "discarded" })
export default {
  example: figma.code`<DefaultStatus status="${status}" message={message}${status === 'failed' ? ' onRetry={retry}' : ''} />`,
  imports: ['import { DefaultStatus } from "@marktiderman/genesis-forms-native"'],
  id: 'forms-native-default-status',
  metadata: { nestable: true },
}
