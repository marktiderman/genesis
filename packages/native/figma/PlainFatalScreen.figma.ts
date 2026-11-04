// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=115-1276
// source=packages/native/src/errors.tsx
// component=PlainFatalScreen
import figma from 'figma'

export default {
  example: figma.code`<PlainFatalScreen error={error} retry={retry} />`,
  imports: ['import { PlainFatalScreen } from "@marktiderman/genesis-native"'],
  id: 'native-plain-fatal-screen',
  metadata: { nestable: false },
}
