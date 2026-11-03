// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=62-20
// source=packages/ui/src/components/patterns/form-field.tsx
// component=FormField
import figma from 'figma'
const instance = figma.selectedInstance

const state = instance.getEnum('state', { default: 'default', error: 'error' })
const label = instance.getString('Label')
const description = instance.getString('Description')
const error = instance.getString('Error')
const required = instance.getBoolean('Required')

export default {
  example: figma.code`<FormField>
  <FormLabel htmlFor="name"${state === 'error' ? ' error' : ''}${required ? ' required' : ''}>${label}</FormLabel>
  <Input id="name"${state === 'error' ? ' aria-invalid' : ''} />${description ? figma.code`
  <FormDescription>${description}</FormDescription>` : ''}${state === 'error' ? figma.code`
  <FormError>${error}</FormError>` : ''}
</FormField>`,
  imports: ['import { FormDescription, FormError, FormField, FormLabel, Input } from "@marktiderman/genesis-ui"'],
  id: 'form-field',
  metadata: { nestable: true },
}
