// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=115-1313
// source=packages/native/src/updates/screens.tsx
// component=WhatsNewSheet
import figma from 'figma'

export default {
  example: figma.code`<WhatsNewSheet notes={notes} version={version} dismiss={dismiss} />`,
  imports: ['import { WhatsNewSheet } from "@marktiderman/genesis-native/updates"'],
  id: 'native-whats-new-sheet',
  metadata: { nestable: false },
}
