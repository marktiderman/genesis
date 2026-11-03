// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=62-21
// source=packages/ui/src/components/layout/form-page.tsx
// component=FormPage
import figma from 'figma'
const instance = figma.selectedInstance

const title = instance.getString('Title')
const description = instance.getString('Description')

export default {
  example: figma.code`<FormPage
  title="${title}"${description ? figma.code`
  description="${description}"` : ''}
  onSubmit={handleSubmit}
  actions={<Button type="submit">Save</Button>}
>
  {fields}
</FormPage>`,
  imports: ['import { Button, FormPage } from "@marktiderman/genesis-ui"'],
  id: 'form-page',
  metadata: { nestable: false },
}
