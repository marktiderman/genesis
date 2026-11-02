// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=17-234
// source=packages/ui-native/src/layouts/thread-page.tsx
// component=ThreadPage
// ThreadPage renders from data (messages, composer): the Figma "Show typing" and
// "Timestamp" properties describe sample rows and have no prop.
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<ThreadPage
  headerTitle="Conversation"
  messages={messages}
  composer={{ value: draft, onChangeText: setDraft, onSend: send }}
  readAt={readAt}
/>`,
  imports: ['import { ThreadPage } from "@marktiderman/genesis-ui-native/layouts"'],
  id: 'thread-page',
  metadata: { nestable: false },
}
