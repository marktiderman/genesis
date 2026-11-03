// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=62-526
// source=packages/ui/src/components/data/WizardForm.tsx
// component=WizardForm
// The current step is the wizard's own state (it moves with Next and Back), so the "step"
// variant is not emitted; the step titles are.
import figma from 'figma'
const instance = figma.selectedInstance

const step = instance.getEnum('step', { 1: '1', 2: '2', 3: '3' })
const step1 = instance.getString('Step 1')
const step2 = instance.getString('Step 2')
const step3 = instance.getString('Step 3')

export default {
  example: figma.code`<WizardForm
  steps={[
    { id: "step-1", title: "${step1}", fields: ["name"] },
    { id: "step-2", title: "${step2}", fields: ["owner"] },
    { id: "step-3", title: "${step3}", fields: ["notes"] },
  ]}
  form={form}
  fields={fields}
  action="create"
  isSaving={isSaving}
  onSubmit={handleSubmit}
/>`,
  imports: ['import { WizardForm } from "@marktiderman/genesis-ui/data"'],
  id: 'wizard-form',
  metadata: { nestable: false },
}
