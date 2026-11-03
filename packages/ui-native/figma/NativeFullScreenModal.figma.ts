// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=40-92
// source=packages/ui-native/src/components/full-screen-modal.tsx
// component=NativeFullScreenModal
import figma from 'figma'
const instance = figma.selectedInstance

const tone = instance.getEnum('tone', { dark: 'dark', app: 'app' })

export default {
  example: figma.code`<NativeFullScreenModal open={open} onOpenChange={setOpen}${tone !== 'dark' ? figma.code` tone="${tone}"` : ''}>
  {children}
</NativeFullScreenModal>`,
  imports: ['import { NativeFullScreenModal } from "@marktiderman/genesis-ui-native"'],
  id: 'native-full-screen-modal',
  metadata: { nestable: false },
}
