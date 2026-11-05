// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=115-1461
// source=packages/native/src/updates/screens.tsx
// component=MaintenanceScreen
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<MaintenanceScreen message={policy.message} retry={retry} retrying={${instance.getEnum('retrying', { false: 'false', true: 'true' })}} />`,
  imports: ['import { MaintenanceScreen } from "@marktiderman/genesis-native/updates"'],
  id: 'native-maintenance-screen',
  metadata: { nestable: false },
}
