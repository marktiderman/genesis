// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=64-226
// source=packages/ui/src/components/ui/popover.tsx
// component=Popover
import figma from 'figma'
const instance = figma.selectedInstance

const title = instance.getString('Title')
const description = instance.getString('Description')

export default {
  example: figma.code`<Popover>
  <PopoverTrigger asChild>
    <Button variant="outline">Open</Button>
  </PopoverTrigger>
  <PopoverContent>
    <p className="font-medium">${title}</p>
    <p className="text-sm text-muted-foreground">${description}</p>
  </PopoverContent>
</Popover>`,
  imports: ['import { Button, Popover, PopoverContent, PopoverTrigger } from "@marktiderman/genesis-ui"'],
  id: 'popover',
  metadata: { nestable: false },
}
