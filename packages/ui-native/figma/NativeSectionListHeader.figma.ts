// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=41-124
// source=packages/ui-native/src/components/section-list.tsx
// component=NativeSectionListHeader
import figma from 'figma'
const instance = figma.selectedInstance

const title = instance.getString('Title')
const trailing = instance.getEnum('Show trailing', { false: false, true: true })

export default {
  example: figma.code`<NativeSectionListHeader title="${title}"${trailing ? ' trailing={<NativeButton variant="ghost" size="sm">See all</NativeButton>}' : ''} />`,
  imports: [
    trailing
      ? 'import { NativeSectionListHeader, NativeButton } from "@marktiderman/genesis-ui-native"'
      : 'import { NativeSectionListHeader } from "@marktiderman/genesis-ui-native"',
  ],
  id: 'native-section-list-header',
  metadata: { nestable: true },
}
