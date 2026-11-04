// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=120-28
// source=packages/forms-native/src/chrome.tsx
// component=ChoiceRow
import figma from 'figma'
const instance = figma.selectedInstance
const label = instance.getString('Label')
const multiple = instance.getEnum('multiple', { false: false, true: true })
const selected = instance.getEnum('selected', { false: false, true: true })
export default {
  example: figma.code`<ChoiceRow label={${JSON.stringify(label)}} selected={${selected ? 'true' : 'false'}} multiple={${multiple ? 'true' : 'false'}} onPress={toggle} />`,
  imports: ['import { ChoiceRow } from "@marktiderman/genesis-forms-native"'],
  id: 'forms-native-choice-row',
  metadata: { nestable: true },
}
