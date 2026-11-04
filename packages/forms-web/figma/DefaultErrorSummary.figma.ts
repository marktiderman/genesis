// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=124-118
// source=packages/forms-web/src/Form.tsx
// component=DefaultErrorSummary
import figma from 'figma'

export default {
  example: figma.code`<DefaultErrorSummary count={errors.length} errors={errors} />`,
  imports: ['import { DefaultErrorSummary } from "@marktiderman/genesis-forms-web"'],
  id: 'forms-web-default-error-summary',
  metadata: { nestable: true },
}
