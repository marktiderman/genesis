// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=74-157
// source=packages/ui/src/components/resource/FollowUpList.tsx
// component=FollowUpList
import figma from 'figma'
const instance = figma.selectedInstance

const title = instance.getString('Title')

export default {
  example: figma.code`<FollowUpList entries={entries} title="${title}" />`,
  imports: ['import { FollowUpList } from "@marktiderman/genesis-ui/resource"'],
  id: 'follow-up-list',
  metadata: { nestable: true },
}
