// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=91-233
// source=packages/ui-native/src/components/thread-list.tsx
// component=NativeThreadList
// "Show load earlier" is `hasEarlier` with its `onLoadEarlier`. "Highlight a row" is what a
// jump does for two seconds (`renderItem` reads `info.highlighted`) and "Day header" is a row
// of its own in `data`: neither is a prop, so neither is emitted.
import figma from 'figma'
const instance = figma.selectedInstance

const loading = instance.getBoolean('loading')
const showLoadEarlier = instance.getBoolean('Show load earlier')

export default {
  example: figma.code`<NativeThreadList
  data={messages}
  keyExtractor={(row) => row.id}
  renderItem={(row, info) => <MessageRow message={row} highlighted={info.highlighted} />}${loading ? `
  loading` : ''}${showLoadEarlier ? `
  hasEarlier
  onLoadEarlier={loadEarlier}` : ''}
/>`,
  imports: ['import { NativeThreadList } from "@marktiderman/genesis-ui-native"'],
  id: 'native-thread-list',
  metadata: { nestable: false },
}
