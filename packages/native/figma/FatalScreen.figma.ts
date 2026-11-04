// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=115-1192
// source=packages/native/src/errors.tsx
// component=FatalScreen
import figma from 'figma'

export default {
  example: figma.code`<FatalScreen error={error} retry={retry} />`,
  imports: ['import { FatalScreen } from "@marktiderman/genesis-native"'],
  id: 'native-fatal-screen',
  metadata: { nestable: false },
}
