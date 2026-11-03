// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=41-140
// source=packages/ui-native/src/components/icon.tsx
// component=NativeIcon
// The swapped icon component is named `icon/<name>` in the library; `name` is the part after
// the slash, which is the NativeIconName in code.
import figma from 'figma'
const instance = figma.selectedInstance

const size = instance.getEnum('size', { '16': 16, '20': 20, '24': 24 })
const icon = instance.findInstance('Icon')
const iconName = icon && icon.type === 'INSTANCE' ? icon.name.replace(/^icon\//, '') : 'bell'

export default {
  example: figma.code`<NativeIcon name="${iconName}"${size !== 20 ? figma.code` size={${size}}` : ''} />`,
  imports: ['import { NativeIcon } from "@marktiderman/genesis-ui-native"'],
  id: 'native-icon',
  metadata: { nestable: true },
}
