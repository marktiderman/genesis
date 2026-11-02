// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=12-371
// source=packages/ui-native/src/layouts/screen-container.tsx
// component=ScreenContainer
// ScreenContainer is the screen's safe-area and scroll wrapper. The nav bar and the tab bar
// in the Figma frame belong to the navigator (Stack.Screen / Tabs), not to this component,
// so "Show nav bar" and "Show tab bar" have no prop here.
import figma from 'figma'
const instance = figma.selectedInstance

const showNavBar = instance.getBoolean('Show nav bar')

export default {
  example: figma.code`${showNavBar ? '<Stack.Screen options={composeHeaderOptions({ headerTitle: "Title" })} />\n' : ''}<ScreenContainer scroll>
  {children}
</ScreenContainer>`,
  imports: ['import { ScreenContainer, composeHeaderOptions } from "@marktiderman/genesis-ui-native/layouts"'],
  id: 'screen-container',
  metadata: { nestable: false },
}
