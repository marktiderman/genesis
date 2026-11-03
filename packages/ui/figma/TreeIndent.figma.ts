// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=72-373
// source=packages/ui/src/components/data/TreeIndent.tsx
// component=TreeIndent
import figma from 'figma'
const instance = figma.selectedInstance

const depth = instance.getEnum('depth', { '0': '0', '1': '1', '2': '2' })
const hasChildren = instance.getEnum('hasChildren', { true: 'true', false: 'false' })
const expanded = instance.getEnum('expanded', { true: 'true', false: 'false' })
const label = instance.getString('Label')

export default {
  example: figma.code`<TreeIndent
  node={{ depth: ${depth}, hasChildren: ${hasChildren}, expanded: ${expanded} }}
  name="${label}"
  onToggle={onToggle}
>
  ${label}
</TreeIndent>`,
  imports: ['import { TreeIndent } from "@marktiderman/genesis-ui/data"'],
  id: 'tree-indent',
  metadata: { nestable: true },
}
