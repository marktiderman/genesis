// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=60-405
// source=packages/ui/src/components/ui/alert.tsx
// component=Alert
import figma from 'figma'
const instance = figma.selectedInstance

const variant = instance.getEnum('variant', { default: 'default', destructive: 'destructive' })
const title = instance.getString('Title')
const description = instance.getString('Description')

export default {
  example: figma.code`<Alert variant="${variant}">
  <AlertTitle>${title}</AlertTitle>
  <AlertDescription>${description}</AlertDescription>
</Alert>`,
  imports: ['import { Alert, AlertDescription, AlertTitle } from "@marktiderman/genesis-ui"'],
  id: 'alert',
  metadata: { nestable: true },
}
