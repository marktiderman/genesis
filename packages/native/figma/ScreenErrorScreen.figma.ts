// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=115-1238
// source=packages/native/src/screen-boundary.tsx
// component=ScreenErrorScreen
import figma from 'figma'

export default {
  example: figma.code`export const ErrorBoundary = createScreenErrorBoundary({ fallback: ScreenErrorScreen })`,
  imports: ['import { ScreenErrorScreen, createScreenErrorBoundary } from "@marktiderman/genesis-native"'],
  id: 'native-screen-error-screen',
  metadata: { nestable: false },
}
