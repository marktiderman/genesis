// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=7-125
// source=packages/ui-native/src/components/stepper.tsx
// component=NativeStepper
// The Figma NativeStepper is drawn as a numeric stepper with one "Value" text; the code
// NativeStepper is a step indicator (steps + current). "Value" maps to the current step
// index (1-based in the design, 0-based in code).
import figma from 'figma'
const instance = figma.selectedInstance

const value = Number(instance.getString('Value')) || 1

export default {
  example: figma.code`<NativeStepper steps={steps} current={${value - 1}} />`,
  imports: ['import { NativeStepper } from "@marktiderman/genesis-ui-native"'],
  id: 'native-stepper',
  metadata: { nestable: true },
}
