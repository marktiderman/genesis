// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=76-143
// source=packages/ui/src/components/patterns/auth-form.tsx
// component=AuthForm
import figma from 'figma'
const instance = figma.selectedInstance

const mode = instance.getEnum('mode', { 'sign-in': 'sign-in', 'sign-up': 'sign-up', 'forgot-password': 'forgot-password', 'new-password': 'new-password' })

export default {
  example: figma.code`<AuthForm client={client} mode="${mode}" onModeChange={setMode} />`,
  imports: ['import { AuthForm } from "@marktiderman/genesis-ui"'],
  id: 'auth-form',
  metadata: { nestable: true },
}
