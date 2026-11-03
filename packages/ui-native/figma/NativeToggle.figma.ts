// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=39-58
// source=packages/ui-native/src/components/toggle.tsx
// component=NativeToggle
import figma from 'figma'
const instance = figma.selectedInstance

const label = instance.getString('Label')
const variant = instance.getEnum('variant', { default: 'default', outline: 'outline' })
const size = instance.getEnum('size', { default: 'default', sm: 'sm', lg: 'lg' })
const pressed = instance.getEnum('pressed', { false: false, true: true })

export default {
  example: figma.code`<NativeToggle${variant !== 'default' ? figma.code` variant="${variant}"` : ''}${size !== 'default' ? figma.code` size="${size}"` : ''} pressed={${pressed ? 'true' : 'false'}} onPressedChange={setPressed}>
  <NativeText>${label}</NativeText>
</NativeToggle>`,
  imports: ['import { NativeToggle, NativeText } from "@marktiderman/genesis-ui-native"'],
  id: 'native-toggle',
  metadata: { nestable: true },
}
