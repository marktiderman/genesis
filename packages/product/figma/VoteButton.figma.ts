// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=115-3161
// source=packages/product/src/native/idea-board.tsx
// component=VoteButton
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<VoteButton voted={${instance.getBoolean('voted')}} label={String(idea.votes)} onPress={toggleVote} />`,
  imports: ['import { VoteButton } from "@marktiderman/genesis-product/native"'],
  id: 'product-vote-button',
  metadata: { nestable: true },
}
