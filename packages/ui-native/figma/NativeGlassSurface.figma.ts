// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=41-76
// source=packages/ui-native/src/components/glass-surface.tsx
// component=NativeGlassSurface
import figma from 'figma'
const instance = figma.selectedInstance

const style = instance.getEnum('glassEffectStyle', { regular: 'regular', clear: 'clear' })

export default {
  example: figma.code`<NativeGlassSurface radius={16}${style !== 'regular' ? figma.code` glassEffectStyle="${style}"` : ''}>
  {children}
</NativeGlassSurface>`,
  imports: ['import { NativeGlassSurface } from "@marktiderman/genesis-ui-native"'],
  id: 'native-glass-surface',
  metadata: { nestable: true },
}
