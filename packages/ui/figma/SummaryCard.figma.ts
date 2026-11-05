// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=74-118
// source=packages/ui/src/components/resource/SummaryCard.tsx
// component=SummaryCard
import figma from 'figma'
const instance = figma.selectedInstance

const title = instance.getString('Title')
const meta = instance.getString('Meta')
const icon = instance.getInstanceSwap('Icon')
let iconCode
if (icon && icon.type === 'INSTANCE') {
  iconCode = icon.executeTemplate().example
}

export default {
  example: figma.code`<SummaryCard title="${title}" meta="${meta}"${iconCode ? figma.code` icon={${iconCode}}` : ''}>
  {children}
</SummaryCard>`,
  imports: ['import { SummaryCard } from "@marktiderman/genesis-ui/resource"'],
  id: 'summary-card',
  metadata: { nestable: true },
}
