// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=76-230
// source=packages/ui/src/components/layout/auth-page.tsx
// component=AuthPage
import figma from 'figma'
const instance = figma.selectedInstance

const asidePosition = instance.getEnum('asidePosition', { start: 'start', end: 'end' })
const headline = instance.getString('Headline')
const subhead = instance.getString('Subhead')
const showSocial = instance.getBoolean('Show social')

export default {
  example: figma.code`<AuthPage
  branding={{ headline: "${headline}", subhead: "${subhead}" }}
  asidePosition="${asidePosition}"${showSocial ? figma.code`
  social={social}` : ''}
>
  <AuthForm client={client} />
</AuthPage>`,
  imports: [
    'import { AuthPage } from "@marktiderman/genesis-ui/layout"',
    'import { AuthForm } from "@marktiderman/genesis-ui"',
  ],
  id: 'auth-page',
  metadata: { nestable: false },
}
