// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=140-136
// source=packages/ui-native/src/components/context-menu.tsx
// component=NativeContextMenu
// The action rows become `actions`; the last one shown in `destructive` is `destructive: true`.
import figma from 'figma'
const instance = figma.selectedInstance

const showTitle = instance.getBoolean('Show title')
const title = instance.getString('title')
const action1 = instance.getString('action1')
const showAction2 = instance.getBoolean('Show action 2')
const action2 = instance.getString('action2')
const showDestructive = instance.getBoolean('Show destructive')
const destructiveAction = instance.getString('destructiveAction')
const cancelLabel = instance.getString('cancelLabel')

export default {
  example: figma.code`<NativeContextMenu
  open={open}
  onOpenChange={setOpen}${showTitle ? figma.code`
  title="${title}"` : ''}
  actions={[
    { id: "a1", label: "${action1}", onPress: onAction1 },${showAction2 ? figma.code`
    { id: "a2", label: "${action2}", onPress: onAction2 },` : ''}${showDestructive ? figma.code`
    { id: "destructive", label: "${destructiveAction}", destructive: true, onPress: onDestructive },` : ''}
  ]}${cancelLabel !== 'Cancel' ? figma.code`
  cancelLabel="${cancelLabel}"` : ''}
/>`,
  imports: ['import { NativeContextMenu } from "@marktiderman/genesis-ui-native"'],
  id: 'native-context-menu',
  metadata: { nestable: false },
}
