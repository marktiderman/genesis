// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=120-42
// source=packages/forms-native/src/chrome.tsx
// component=FieldChrome
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<FieldChrome props={props}>
  {answer}
</FieldChrome>`,
  imports: ['import { FieldChrome } from "@marktiderman/genesis-forms-native"'],
  id: 'forms-native-field-chrome',
  metadata: { nestable: true },
}
