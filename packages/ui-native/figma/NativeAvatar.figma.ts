// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=8-37
// source=packages/ui-native/src/components/avatar.tsx
// component=NativeAvatar
// Code Connect template (CLI v2, parserless): the Figma NativeAvatar in the Genesis
// library ↔ NativeAvatar. Published with `npx @figma/code-connect connect publish`
// from the repo root (figma.config.json). The first mapping, used to confirm
// the Figma plan accepts Code Connect writes; the rest follow the same shape.
import figma from 'figma'
const instance = figma.selectedInstance

const fallback = instance.getString('Initials')
const showImage = instance.getBoolean('Show image')
const size = instance.getEnum('size', { '24': 24, '32': 32, '40': 40, '56': 56, '72': 72 })

export default {
  example: figma.code`<NativeAvatar${showImage ? ' src={imageUrl}' : ''}${fallback ? figma.code` fallback="${fallback}"` : ''} size={${size}} />`,
  imports: ['import { NativeAvatar } from "@marktiderman/genesis-ui-native"'],
  id: 'native-avatar',
  metadata: { nestable: true },
}
