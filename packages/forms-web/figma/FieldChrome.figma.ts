// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=124-3
// source=packages/forms-web/src/chrome.tsx
// component=FieldChrome
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<FieldChrome props={props}>
  {control}
</FieldChrome>`,
  imports: ['import { FieldChrome } from "@marktiderman/genesis-forms-web"'],
  id: 'forms-web-field-chrome',
  metadata: { nestable: true },
}
