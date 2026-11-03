// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=70-156
// source=packages/ui/src/components/ui/input-otp.tsx
// component=InputOTP
// The state=empty|filled property is the typed value, an interaction state, and is not emitted.
// The slot count is not a Figma property; the example shows six.
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<InputOTP maxLength={6} value={code} onChange={setCode}>
  <InputOTPGroup>
    <InputOTPSlot index={0} />
    <InputOTPSlot index={1} />
    <InputOTPSlot index={2} />
    <InputOTPSlot index={3} />
    <InputOTPSlot index={4} />
    <InputOTPSlot index={5} />
  </InputOTPGroup>
</InputOTP>`,
  imports: ['import { InputOTP, InputOTPGroup, InputOTPSlot } from "@marktiderman/genesis-ui"'],
  id: 'input-otp',
  metadata: { nestable: true },
}
