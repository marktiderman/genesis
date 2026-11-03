// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=41-125
// source=packages/ui-native/src/components/refresh-control.tsx
// component=NativeRefreshControl
// Rendered through a list's `refreshControl` prop, never on its own.
import figma from 'figma'
const instance = figma.selectedInstance

const title = instance.getString('Title')

export default {
  example: figma.code`<ScrollView
  refreshControl={<NativeRefreshControl refreshing={refreshing} onRefresh={refresh}${title ? figma.code` title="${title}"` : ''} />}
>
  {children}
</ScrollView>`,
  imports: [
    'import { ScrollView } from "react-native"',
    'import { NativeRefreshControl } from "@marktiderman/genesis-ui-native"',
  ],
  id: 'native-refresh-control',
  metadata: { nestable: true },
}
