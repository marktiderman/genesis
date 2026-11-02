// url=https://www.figma.com/design/iv9xTsgM7t2mBff8dniDk0/Genesis?node-id=1-123
// source=packages/ui-native/src/components/avatar.tsx
// component=NativeAvatar
// Code Connect template (CLI v2, parserless): the Figma Avatar in the Genesis
// library ↔ NativeAvatar. Published with `npx @figma/code-connect connect publish`
// from the repo root (figma.config.json). The first mapping, used to confirm
// the Figma plan accepts Code Connect writes; the rest follow the same shape.
import figma from 'figma'
const instance = figma.selectedInstance

const initials = instance.findText('Initials')
const fallback = initials && initials.type === 'TEXT' ? initials.textContent : undefined

export default {
  example: figma.code`<NativeAvatar${fallback ? figma.code` fallback="${fallback}"` : ''} size={40} />`,
  imports: ['import { NativeAvatar } from "@marktiderman/genesis-ui-native"'],
  id: 'native-avatar',
  metadata: { nestable: true },
}
