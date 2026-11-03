// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=77-359
// source=packages/ui/src/components/data/FieldArrayRenderer.tsx
// component=FieldArrayRenderer
// The rows and their inputs come from the form's array `field` definition and react-hook-form's
// `control`; the Figma "Label" is the field's label and the sample rows are placeholders.
import figma from 'figma'
const instance = figma.selectedInstance

const label = instance.getString('Label')

export default {
  example: figma.code`<FieldArrayRenderer
  field={{ name: "attendees", label: ${JSON.stringify(label)}, type: "array", fields: [{ name: "name", label: "Name", type: "text" }, { name: "email", label: "Email", type: "email" }] }}
  control={form.control}
  action="create"
/>`,
  imports: ['import { FieldArrayRenderer } from "@marktiderman/genesis-ui/data"'],
  id: 'field-array-renderer',
  metadata: { nestable: true },
}
