// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=6-43
// source=packages/ui-native/src/components/card.tsx
// component=NativeCard
// The Figma NativeCard holds NativeCardHeader / NativeCardContent / NativeCardFooter layers
// toggled by "Show header" / "Show content" / "Show footer"; each becomes the matching
// sub-part. The header's title and description are text layers inside the header instance.
import figma from 'figma'
const instance = figma.selectedInstance

const showHeader = instance.getBoolean('Show header')
const showContent = instance.getBoolean('Show content')
const showFooter = instance.getBoolean('Show footer')

const titleText = instance.findText('Text', { traverseInstances: true, path: ['NativeCardTitle'] })
const title = titleText && titleText.type === 'TEXT' ? titleText.textContent : 'Card title'
const descriptionText = instance.findText('Text', { traverseInstances: true, path: ['NativeCardDescription'] })
const description = descriptionText && descriptionText.type === 'TEXT' ? descriptionText.textContent : undefined

const header = showHeader
  ? figma.code`
  <NativeCardHeader>
    <NativeCardTitle>${title}</NativeCardTitle>${description ? figma.code`
    <NativeCardDescription>${description}</NativeCardDescription>` : ''}
  </NativeCardHeader>`
  : ''
const content = showContent ? figma.code`
  <NativeCardContent>{children}</NativeCardContent>` : ''
const footer = showFooter ? figma.code`
  <NativeCardFooter>{actions}</NativeCardFooter>` : ''

export default {
  example: figma.code`<NativeCard>${header}${content}${footer}
</NativeCard>`,
  imports: [
    'import { NativeCard, NativeCardHeader, NativeCardTitle, NativeCardDescription, NativeCardContent, NativeCardFooter } from "@marktiderman/genesis-ui-native"',
  ],
  id: 'native-card',
  metadata: { nestable: true },
}
