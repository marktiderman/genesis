// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=62-369
// source=packages/ui/src/components/data/ResourceForm.tsx
// component=ResourceForm
// The form's fields come from the resource or view, not from Figma. Wizard forms are WizardForm.
import figma from 'figma'
const instance = figma.selectedInstance

const layout = instance.getEnum('layout', { dialog: 'dialog', sheet: 'sheet', page: 'page' })
const columns = instance.getEnum('columns', { 1: '1', 2: '2' })
const title = instance.getString('Title')
const description = instance.getString('Description')

export default {
  example: figma.code`<ResourceForm
  resource="projects"
  action="create"
  open={open}
  onOpenChange={setOpen}
  title="${title}"${description ? figma.code`
  description="${description}"` : ''}
  layout="${layout}"
  columns={${columns}}
/>`,
  imports: ['import { ResourceForm } from "@marktiderman/genesis-ui/data"'],
  id: 'resource-form',
  metadata: { nestable: false },
}
