// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=141-2242
// source=packages/ui/src/components/patterns/messaging/inbox-layout.tsx
// component=InboxLayout
// The `width` variant is the breakpoint, not a prop: `wide` shows the views rail, the
// thread's toolbar row with the Details toggle and the context panel; `narrow` shows the
// views button over the list, and `narrow-views-open` its sheet. The thread gets
// `{ contextToggle }` to place the toggle in its own header (`Thread` stands for the app's
// ThreadPage, which puts it in its headerRegion slot).
import figma from 'figma'

export default {
  example: figma.code`<InboxLayout
  views={<InboxViews views={views} activeId={viewId} onSelect={setViewId} />}
  activeViewLabel={activeView.label}
  list={<InboxPage items={items} />}
  thread={({ contextToggle }) => <Thread contextToggle={contextToggle} />}
  context={context}
  threadOpen={threadOpen}
  onBack={closeThread}
/>`,
  imports: ['import { InboxLayout, InboxPage, InboxViews } from "@marktiderman/genesis-ui"'],
  id: 'inbox-layout',
  metadata: { nestable: false },
}
