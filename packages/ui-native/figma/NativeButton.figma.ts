// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=4-107
// source=packages/ui-native/src/components/button.tsx
// component=NativeButton
// NativeButton takes no icon prop: the Figma "Show icon" / "Icon" properties have no
// code equivalent and are not emitted.
import figma from 'figma'
const instance = figma.selectedInstance

const label = instance.getString('Label')
const loading = instance.getBoolean('loading')
const disabled = instance.getBoolean('disabled')
const variant = instance.getEnum('variant', {
  default: 'default', secondary: 'secondary', outline: 'outline', ghost: 'ghost', destructive: 'destructive',
})
const size = instance.getEnum('size', { sm: 'sm', md: 'md', lg: 'lg' })

export default {
  example: figma.code`<NativeButton variant="${variant}" size="${size}"${loading ? ' loading' : ''}${disabled ? ' disabled' : ''} onPress={() => {}}>${label}</NativeButton>`,
  imports: ['import { NativeButton } from "@marktiderman/genesis-ui-native"'],
  id: 'native-button',
  metadata: { nestable: true },
}
