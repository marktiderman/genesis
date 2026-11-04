// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=115-1545
// source=packages/native/src/updates/screens.tsx
// component=UpdateBanner
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<UpdateBanner
  reload={reload}
  dismiss={dismiss}
  canReload={canReload}
  blocked={${instance.getEnum('state', { blocked: 'true', ready: 'false', reloading: 'false' })}}
  reloading={${instance.getEnum('state', { reloading: 'true', ready: 'false', blocked: 'false' })}}
/>`,
  imports: ['import { UpdateBanner } from "@marktiderman/genesis-native/updates"'],
  id: 'native-update-banner',
  metadata: { nestable: false },
}
