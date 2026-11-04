// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=141-1922
// source=packages/ui-native/src/layouts/thread-page.tsx
// component=ThreadPage
// ThreadPage renders from data (messages, composer): the Figma "Show typing" and
// "Timestamp" properties describe sample rows and have no prop. The ThreadAttachment sample
// (kind image | file, name) is a message's `attachments` entry, data too. The `state=error`
// variant is `error` with `errorTitle` / `errorBody`.
import figma from 'figma'
const instance = figma.selectedInstance

const state = instance.getEnum('state', { default: 'default', error: 'error' })
const errorTitle = instance.getString('errorTitle')
const errorBody = instance.getString('errorBody')

export default {
  example: figma.code`<ThreadPage
  headerTitle="Conversation"
  messages={messages}
  composer={{ value: draft, onChangeText: setDraft, onSend: send }}
  readAt={readAt}${state === 'error' ? figma.code`
  error
  errorTitle="${errorTitle}"
  errorBody="${errorBody}"
  onRetry={reload}` : ''}
/>`,
  imports: ['import { ThreadPage } from "@marktiderman/genesis-ui-native/layouts"'],
  id: 'thread-page',
  metadata: { nestable: false },
}
