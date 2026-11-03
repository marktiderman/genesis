// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=71-491
// source=packages/ui/src/components/patterns/page-loading.tsx
// component=PageLoading
import figma from 'figma'
const instance = figma.selectedInstance

const variant = instance.getEnum('variant', { page: 'page', section: 'section' })
const label = instance.getString('Label')

export default {
  example: figma.code`<PageLoading variant="${variant}" label="${label}" />`,
  imports: ['import { PageLoading } from "@marktiderman/genesis-ui"'],
  id: 'page-loading',
  metadata: { nestable: true },
}
