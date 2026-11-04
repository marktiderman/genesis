// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=115-1280
// source=packages/native/src/errors.tsx
// component=FatalScreen
// One set, three kinds: app (FatalScreen), plain (PlainFatalScreen, no theme needed) and
// screen (ScreenErrorScreen, the fallback of a screen's error boundary).
import figma from 'figma'
const instance = figma.selectedInstance

const kind = instance.getEnum('kind', { app: 'app', plain: 'plain', screen: 'screen' })

const examples = {
  app: figma.code`<FatalScreen error={error} retry={retry} />`,
  plain: figma.code`<PlainFatalScreen error={error} retry={retry} />`,
  screen: figma.code`export const ErrorBoundary = createScreenErrorBoundary({ fallback: ScreenErrorScreen })`,
}
const imports = {
  app: 'import { FatalScreen } from "@marktiderman/genesis-native"',
  plain: 'import { PlainFatalScreen } from "@marktiderman/genesis-native"',
  screen: 'import { ScreenErrorScreen, createScreenErrorBoundary } from "@marktiderman/genesis-native"',
}

export default {
  example: examples[kind],
  imports: [imports[kind]],
  id: 'native-fatal-screen',
  metadata: { nestable: false },
}
