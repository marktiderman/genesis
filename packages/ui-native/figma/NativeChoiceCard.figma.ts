// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=172-201
// source=packages/ui-native/src/components/choice-card.tsx
// component=NativeChoiceCard
// Media is the `media` slot (a thumbnail or icon); the example shows a NativeIcon there.
import figma from 'figma'
const instance = figma.selectedInstance

const title = instance.getString('Title')
const showDescription = instance.getBoolean('Show description')
const description = instance.getString('Description')
const showMedia = instance.getBoolean('Show media')
const selected = instance.getEnum('selected', { false: false, true: true })
const multiple = instance.getEnum('multiple', { false: false, true: true })
const invalid = instance.getEnum('invalid', { false: false, true: true })
const disabled = instance.getEnum('disabled', { false: false, true: true })

export default {
  example: figma.code`<NativeChoiceCard
  title="${title}"${showDescription ? figma.code`
  description="${description}"` : ''}${showMedia ? figma.code`
  media={<NativeIcon name="calendar" />}` : ''}
  selected={${selected ? 'true' : 'false'}}
  onPress={toggle}${multiple ? figma.code`
  multiple` : ''}${invalid ? figma.code`
  invalid` : ''}${disabled ? figma.code`
  disabled` : ''}
/>`,
  imports: [`import { NativeChoiceCard${showMedia ? ', NativeIcon' : ''} } from "@marktiderman/genesis-ui-native"`],
  id: 'native-choice-card',
  metadata: { nestable: true },
}
