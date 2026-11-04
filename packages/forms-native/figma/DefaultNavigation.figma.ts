// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=121-53
// source=packages/forms-native/src/slots.tsx
// component=DefaultNavigation
import figma from 'figma'
const instance = figma.selectedInstance
const state = instance.getEnum('state', { "first": "first", "middle": "middle", "last": "last", "busy": "busy", "failed": "failed" })
export default {
  example: figma.code`<DefaultNavigation
  canGoBack={${state === 'first' ? 'false' : 'true'}}
  isLast={${state === 'last' ? 'true' : 'false'}}
  busy={${state === 'busy' ? 'true' : 'false'}}
  failed={${state === 'failed' ? 'true' : 'false'}}
  onBack={back}
  onNext={next}
  nextLabel="Next"
  submitLabel="Submit"
  retryLabel="Try again"
  backLabel="Back"
  submitRef={submitRef}
/>`,
  imports: ['import { DefaultNavigation } from "@marktiderman/genesis-forms-native"'],
  id: 'forms-native-default-navigation',
  metadata: { nestable: true },
}
