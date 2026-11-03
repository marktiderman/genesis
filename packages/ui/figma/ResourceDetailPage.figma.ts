// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=73-640
// source=packages/ui/src/components/data/ResourceDetailPage.tsx
// component=ResourceDetailPage
// Title is the record's title, which ResourceDetailPage reads from `titleField`, so it is not mapped.
import figma from 'figma'
const instance = figma.selectedInstance

const showSidebar = instance.getBoolean('Show sidebar')

export default {
  example: figma.code`<ResourceDetailPage resource="items" id={id} titleField="name"${showSidebar ? figma.code`
  sidebar={(record) => <ItemSidebar record={record} />}` : ''}>
  {(record) => <ItemDetails record={record} />}
</ResourceDetailPage>`,
  imports: ['import { ResourceDetailPage } from "@marktiderman/genesis-ui/data"'],
  id: 'resource-detail-page',
  metadata: { nestable: false },
}
