// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=5-18
// source=packages/ui-native/src/components/text.tsx
// component=NativeText
import figma from 'figma'
const instance = figma.selectedInstance

const text = instance.getString('Text')
const preset = instance.getEnum('preset', {
  h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4', body: 'body', 'body-sm': 'body-sm', caption: 'caption', label: 'label',
})

export default {
  example: figma.code`<NativeText preset="${preset}">${text}</NativeText>`,
  imports: ['import { NativeText } from "@marktiderman/genesis-ui-native"'],
  id: 'native-text',
  metadata: { nestable: true },
}
