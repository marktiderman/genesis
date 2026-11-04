// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=12-421
// source=packages/ui-native/src/layouts/auth-screen.tsx
// component=AuthScreen
// "Title" and "Subtitle" are the branding's headline and subhead; "Footer" is the footer
// node. "Show secondary" and "Show provider 2" are the providers list; "Show password" off is
// form mode "magic-link"; "Show forgot password" is onForgotPassword.
import figma from 'figma'
const instance = figma.selectedInstance

const headline = instance.getString('Title')
const subhead = instance.getString('Subtitle')
const footer = instance.getString('Footer')
const showSocial = instance.getBoolean('Show secondary')
const showSecondProvider = instance.getBoolean('Show provider 2')
const showPassword = instance.getBoolean('Show password')
const showForgot = instance.getBoolean('Show forgot password')
const providers = [
  showSocial ? '{ id: "apple", label: "Continue with Apple", onPress: signInWithApple }' : null,
  showSocial && showSecondProvider ? '{ id: "google", label: "Continue with Google", onPress: signInWithGoogle }' : null,
].filter(Boolean)

export default {
  example: figma.code`<AuthScreen
  branding={{ headline: "${headline}"${subhead ? figma.code`, subhead: "${subhead}"` : ''} }}${providers.length ? `\n  providers={[${providers.join(', ')}]}` : ''}
  form={{ ${showPassword ? '' : 'mode: "magic-link", '}onSubmit: signIn }}${showForgot ? '\n  onForgotPassword={forgotPassword}' : ''}${footer ? figma.code`
  footer={<NativeText preset="caption">${footer}</NativeText>}` : ''}
/>`,
  imports: [
    'import { AuthScreen } from "@marktiderman/genesis-ui-native/layouts"',
    'import { NativeText } from "@marktiderman/genesis-ui-native"',
  ],
  id: 'auth-screen',
  metadata: { nestable: false },
}
