// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=70-117
// source=packages/ui/src/components/ui/input-group.tsx
// component=InputGroup
import figma from 'figma'
const instance = figma.selectedInstance

const prefix = instance.getString('Prefix')
const value = instance.getString('Value')
const suffix = instance.getString('Suffix')
const showPrefix = instance.getBoolean('Show prefix')
const showSuffix = instance.getBoolean('Show suffix')

export default {
  example: figma.code`<InputGroup>${showPrefix ? figma.code`
  <InputGroupPrefix>${prefix}</InputGroupPrefix>` : ''}
  <InputGroupInput defaultValue="${value}" />${showSuffix ? figma.code`
  <InputGroupSuffix>${suffix}</InputGroupSuffix>` : ''}
</InputGroup>`,
  imports: ['import { InputGroup, InputGroupInput, InputGroupPrefix, InputGroupSuffix } from "@marktiderman/genesis-ui"'],
  id: 'input-group',
  metadata: { nestable: true },
}
