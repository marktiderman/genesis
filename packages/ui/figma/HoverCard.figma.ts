// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=67-173
// source=packages/ui/src/components/ui/hover-card.tsx
// component=HoverCard
import figma from 'figma'
const instance = figma.selectedInstance

const trigger = instance.getString('Trigger')
const title = instance.getString('Title')
const description = instance.getString('Description')

export default {
  example: figma.code`<HoverCard>
  <HoverCardTrigger asChild>
    <a href={href}>${trigger}</a>
  </HoverCardTrigger>
  <HoverCardContent>
    <H4>${title}</H4>
    <Muted>${description}</Muted>
  </HoverCardContent>
</HoverCard>`,
  imports: ['import { H4, HoverCard, HoverCardContent, HoverCardTrigger, Muted } from "@marktiderman/genesis-ui"'],
  id: 'hover-card',
  metadata: { nestable: true },
}
