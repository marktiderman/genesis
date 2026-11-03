// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=40-78
// source=packages/ui-native/src/components/popover.tsx
// component=NativePopover
import figma from 'figma'
const instance = figma.selectedInstance

const side = instance.getEnum('side', { bottom: 'bottom', top: 'top' })

export default {
  example: figma.code`<NativePopover open={open} onOpenChange={setOpen}>
  <NativePopoverTrigger>
    <NativeText>Open popover</NativeText>
  </NativePopoverTrigger>
  <NativePopoverContent${side !== 'bottom' ? figma.code` side="${side}"` : ''}>
    {children}
  </NativePopoverContent>
</NativePopover>`,
  imports: [
    'import { NativePopover, NativePopoverTrigger, NativePopoverContent, NativeText } from "@marktiderman/genesis-ui-native"',
  ],
  id: 'native-popover',
  metadata: { nestable: false },
}
