// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=70-225
// source=packages/ui/src/components/ui/accordion.tsx
// component=Accordion
// Item 1-3 are the triggers; Content is the one body text the set shows under each.
import figma from 'figma'
const instance = figma.selectedInstance

const type = instance.getEnum('type', { single: 'single', multiple: 'multiple' })
const item1 = instance.getString('Item 1')
const item2 = instance.getString('Item 2')
const item3 = instance.getString('Item 3')
const content = instance.getString('Content')

export default {
  example: figma.code`<Accordion type="${type}"${type === 'single' ? ' collapsible' : ''}>
  <AccordionItem value="item-1">
    <AccordionTrigger>${item1}</AccordionTrigger>
    <AccordionContent>${content}</AccordionContent>
  </AccordionItem>
  <AccordionItem value="item-2">
    <AccordionTrigger>${item2}</AccordionTrigger>
    <AccordionContent>${content}</AccordionContent>
  </AccordionItem>
  <AccordionItem value="item-3">
    <AccordionTrigger>${item3}</AccordionTrigger>
    <AccordionContent>${content}</AccordionContent>
  </AccordionItem>
</Accordion>`,
  imports: ['import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@marktiderman/genesis-ui"'],
  id: 'accordion',
  metadata: { nestable: true },
}
