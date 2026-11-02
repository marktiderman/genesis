// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=8-185
// source=packages/ui-native/src/components/alert.tsx
// component=NativeAlert
import figma from 'figma'
const instance = figma.selectedInstance

const title = instance.getString('Title')
const description = instance.getString('Description')
const variant = instance.getEnum('variant', { default: 'default', destructive: 'destructive', success: 'success', warning: 'warning', info: 'info' })

export default {
  example: figma.code`<NativeAlert variant="${variant}">
  <NativeAlertTitle variant="${variant}">${title}</NativeAlertTitle>${description ? figma.code`
  <NativeAlertDescription variant="${variant}">${description}</NativeAlertDescription>` : ''}
</NativeAlert>`,
  imports: ['import { NativeAlert, NativeAlertTitle, NativeAlertDescription } from "@marktiderman/genesis-ui-native"'],
  id: 'native-alert',
  metadata: { nestable: true },
}
