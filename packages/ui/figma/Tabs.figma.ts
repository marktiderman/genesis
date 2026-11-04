// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=59-963
// source=packages/ui/src/components/ui/tabs.tsx
// component=Tabs
import figma from 'figma'
const instance = figma.selectedInstance

const selected = instance.getEnum('selected', { 1: '1', 2: '2', 3: '3' })
const tab1 = instance.getString('Tab 1')
const tab2 = instance.getString('Tab 2')
const tab3 = instance.getString('Tab 3')
const extra = [
  instance.getBoolean('Show tab 4') ? instance.getString('Tab 4') : null,
  instance.getBoolean('Show tab 5') ? instance.getString('Tab 5') : null,
  instance.getBoolean('Show tab 6') ? instance.getString('Tab 6') : null,
]
const extraTriggers = extra
  .map((label, i) => (label ? `\n    <TabsTrigger value="tab-${i + 4}">${label}</TabsTrigger>` : ''))
  .join('')
const extraContent = extra
  .map((label, i) => (label ? `\n  <TabsContent value="tab-${i + 4}">{panel${i + 4}}</TabsContent>` : ''))
  .join('')

export default {
  example: figma.code`<Tabs value="tab-${selected}" onValueChange={setTab}>
  <TabsList>
    <TabsTrigger value="tab-1">${tab1}</TabsTrigger>
    <TabsTrigger value="tab-2">${tab2}</TabsTrigger>
    <TabsTrigger value="tab-3">${tab3}</TabsTrigger>${extraTriggers}
  </TabsList>
  <TabsContent value="tab-1">{panel1}</TabsContent>
  <TabsContent value="tab-2">{panel2}</TabsContent>
  <TabsContent value="tab-3">{panel3}</TabsContent>${extraContent}
</Tabs>`,
  imports: ['import { Tabs, TabsContent, TabsList, TabsTrigger } from "@marktiderman/genesis-ui"'],
  id: 'tabs',
  metadata: { nestable: true },
}
