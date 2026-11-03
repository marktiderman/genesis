// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=41-67
// source=packages/ui-native/src/components/accordion.tsx
// component=NativeAccordion
// The three Figma items are sample content; `type` is the one prop. Which rows are open in
// Figma is interaction state (`value` / `defaultValue` in code).
import figma from 'figma'
const instance = figma.selectedInstance

const type = instance.getEnum('type', { single: 'single', multiple: 'multiple' })

const item = (value: string, title: string) => figma.code`
  <NativeAccordionItem value="${value}">
    <NativeAccordionTrigger>${title}</NativeAccordionTrigger>
    <NativeAccordionContent>
      <NativeText>{${value}Body}</NativeText>
    </NativeAccordionContent>
  </NativeAccordionItem>`

export default {
  example: figma.code`<NativeAccordion${type !== 'single' ? figma.code` type="${type}"` : ''} defaultValue={["item1"]}>${item('item1', 'Is it accessible?')}${item('item2', 'Is it styled?')}${item('item3', 'Is it animated?')}
</NativeAccordion>`,
  imports: [
    'import { NativeAccordion, NativeAccordionItem, NativeAccordionTrigger, NativeAccordionContent, NativeText } from "@marktiderman/genesis-ui-native"',
  ],
  id: 'native-accordion',
  metadata: { nestable: false },
}
