// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=62-527
// source=packages/ui/src/components/data/RelationField.tsx
// component=RelationField
// RelationField draws the picker only; its label and description sit in the surrounding field.
import figma from 'figma'
const instance = figma.selectedInstance

const label = instance.getString('Label')
const value = instance.getString('Value')
const placeholder = instance.getString('Placeholder')
const description = instance.getString('Description')
const showValue = instance.getBoolean('Show value')

export default {
  example: figma.code`<RelationField
  field={{
    key: "owner",
    label: "${label}",
    type: "relation",
    placeholder: "${placeholder}",${description ? figma.code`
    description: "${description}",` : ''}
    relation: { resource: "people" },
  }}
  value={${showValue ? figma.code`"${value}"` : '""'}}
  onChange={setValue}
/>`,
  imports: ['import { RelationField } from "@marktiderman/genesis-ui/data"'],
  id: 'relation-field',
  metadata: { nestable: true },
}
