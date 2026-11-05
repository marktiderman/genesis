// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=115-1408
// source=packages/native/src/updates/screens.tsx
// component=ForceUpgradeScreen
import figma from 'figma'
const instance = figma.selectedInstance

export default {
  example: figma.code`<ForceUpgradeScreen
  minimumVersion={policy.minimumVersion}
  installedVersion={installedVersion}
  storeUrl={storeUrl}
  openStore={openStore}
  retry={retry}
  checking={${instance.getEnum('checking', { false: 'false', true: 'true' })}}
/>`,
  imports: ['import { ForceUpgradeScreen } from "@marktiderman/genesis-native/updates"'],
  id: 'native-force-upgrade-screen',
  metadata: { nestable: false },
}
