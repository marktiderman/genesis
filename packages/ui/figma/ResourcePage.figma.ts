// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=73-605
// source=packages/ui/src/components/data/ResourcePage.tsx
// component=ResourcePage
import figma from 'figma'
const instance = figma.selectedInstance

const detail = instance.getEnum('detail', { none: 'none', panel: 'panel' })

export default {
  example: figma.code`<ResourcePage
  resource="items"
  title="Items"
  columns={columns}
  detail="${detail}"
/>`,
  imports: ['import { ResourcePage } from "@marktiderman/genesis-ui/data"'],
  id: 'resource-page',
  metadata: { nestable: false },
}
