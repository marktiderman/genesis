// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=55-34
// source=packages/ui-native/src/components/lightbox.tsx
// component=NativeLightbox
// The counter and picture are what the viewer renders from `items` and `index`; the caption and
// actions are the render slots.
import figma from 'figma'
const instance = figma.selectedInstance

const showCaption = instance.getBoolean('Show caption')
const showActions = instance.getBoolean('Show actions')

export default {
  example: figma.code`<NativeLightbox
  open={open}
  onOpenChange={setOpen}
  items={items}
  index={index}
  onIndexChange={setIndex}${showCaption ? `
  renderCaption={(item) => <NativeText>{item.caption}</NativeText>}` : ''}${showActions ? `
  renderActions={(item) => <NativeButton variant="ghost" size="sm" onPress={() => share(item)}>Share</NativeButton>}` : ''}
/>`,
  imports: [
    `import { NativeLightbox${showCaption ? ', NativeText' : ''}${showActions ? ', NativeButton' : ''} } from "@marktiderman/genesis-ui-native"`,
  ],
  id: 'native-lightbox',
  metadata: { nestable: false },
}
