// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=64-322
// source=packages/ui/src/components/ui/sonner.tsx
// component=Toaster
// A toast is a call, not an element: toast() from sonner, re-exported by genesis-ui, shows it
// once <Toaster /> is mounted in the app shell. The variant picks the method.
import figma from 'figma'
const instance = figma.selectedInstance

const method = instance.getEnum('variant', { default: 'toast', success: 'toast.success', error: 'toast.error', warning: 'toast.warning', info: 'toast.info', loading: 'toast.loading' })
const title = instance.getString('Title')
const description = instance.getString('Description')

export default {
  example: figma.code`${method}("${title}", { description: "${description}" })`,
  imports: ['import { toast } from "@marktiderman/genesis-ui"'],
  id: 'toast',
  metadata: { nestable: false },
}
