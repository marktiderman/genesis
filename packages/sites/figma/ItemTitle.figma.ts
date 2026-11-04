// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=133-46
// source=packages/sites/src/sections/shared.tsx
// component=ItemTitle
import figma from 'figma'
const instance = figma.selectedInstance
const title = instance.getString('Title')
export default {
  example: figma.code`<ItemTitle ctx={ctx}>${title}</ItemTitle>`,
  imports: ['import { ItemTitle } from "@marktiderman/genesis-sites/sections"'],
  id: 'sites-item-title',
  metadata: { nestable: true },
}
