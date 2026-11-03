// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=40-55
// source=packages/ui-native/src/components/dropdown-menu.tsx
// component=NativeDropdownMenu
// The three Figma items are sample content; the trigger label is the one property.
import figma from 'figma'
const instance = figma.selectedInstance

const trigger = instance.getString('Trigger label')

export default {
  example: figma.code`<NativeDropdownMenu>
  <NativeDropdownMenuTrigger>
    <NativeButton variant="secondary">${trigger}</NativeButton>
  </NativeDropdownMenuTrigger>
  <NativeDropdownMenuContent>
    <NativeDropdownMenuItem onPress={onEdit}>Edit</NativeDropdownMenuItem>
    <NativeDropdownMenuItem onPress={onDuplicate}>Duplicate</NativeDropdownMenuItem>
    <NativeDropdownMenuItem onPress={onDelete} disabled>Delete</NativeDropdownMenuItem>
  </NativeDropdownMenuContent>
</NativeDropdownMenu>`,
  imports: [
    'import { NativeDropdownMenu, NativeDropdownMenuTrigger, NativeDropdownMenuContent, NativeDropdownMenuItem, NativeButton } from "@marktiderman/genesis-ui-native"',
  ],
  id: 'native-dropdown-menu',
  metadata: { nestable: false },
}
