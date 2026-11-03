// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=71-479
// source=packages/ui/src/components/patterns/user-avatar.tsx
// component=UserAvatar
import figma from 'figma'
const instance = figma.selectedInstance

const size = instance.getEnum('size', { sm: 'sm', default: 'default', lg: 'lg' })
const name = instance.getString('Name')
const showImage = instance.getBoolean('Show image')

export default {
  example: figma.code`<UserAvatar name="${name}" size="${size}"${showImage ? ' src={imageUrl}' : ''} />`,
  imports: ['import { UserAvatar } from "@marktiderman/genesis-ui"'],
  id: 'user-avatar',
  metadata: { nestable: true },
}
