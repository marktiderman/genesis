// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=119-25
// source=packages/forms-native/src/parts.tsx
// component=Button
import figma from 'figma'
const instance = figma.selectedInstance
const label = instance.getString('Label')
const variant = instance.getEnum('variant', { "primary": "primary", "secondary": "secondary", "plain": "plain" })
const disabled = instance.getEnum('disabled', { false: false, true: true })
export default {
  example: figma.code`<Button variant="${variant}"${disabled ? ' disabled' : ''} onPress={onPress}>{${JSON.stringify(label)}}</Button>`,
  imports: ['import { Button } from "@marktiderman/genesis-forms-native"'],
  id: 'forms-native-button',
  metadata: { nestable: true },
}
