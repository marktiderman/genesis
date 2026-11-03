// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=60-365
// source=packages/ui/src/components/ui/avatar.tsx
// component=Avatar
// Avatar has no size prop: the Figma sizes are the h-8, h-10 (default) and h-12 classes.
import figma from 'figma'
const instance = figma.selectedInstance

const size = instance.getEnum('size', { sm: ' className="h-8 w-8"', default: '', lg: ' className="h-12 w-12"' })
const initials = instance.getString('Initials')
const showImage = instance.getBoolean('Show image')

export default {
  example: figma.code`<Avatar${size}>${showImage ? `
  <AvatarImage src={user.imageUrl} alt={user.name} />` : ''}
  <AvatarFallback>${initials}</AvatarFallback>
</Avatar>`,
  imports: ['import { Avatar, AvatarFallback, AvatarImage } from "@marktiderman/genesis-ui"'],
  id: 'avatar',
  metadata: { nestable: true },
}
