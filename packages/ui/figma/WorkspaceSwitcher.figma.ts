// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=59-245
// source=packages/ui/src/components/layout/workspace-switcher.tsx
// component=WorkspaceSwitcher
// The "Name" text is the current workspace's label, so it is shown in the example as a
// comment on `current` rather than a prop.
import figma from 'figma'
const instance = figma.selectedInstance

const variant = instance.getEnum('variant', { sidebar: 'sidebar', rail: 'rail', bar: 'bar' })
const name = instance.getString('Name')

export default {
  example: figma.code`<WorkspaceSwitcher
  variant="${variant}"
  workspaces={workspaces}
  current={current} // label: "${name}"
  hrefFor={(workspace) => workspace.path}
/>`,
  imports: ['import { WorkspaceSwitcher } from "@marktiderman/genesis-ui/layout"'],
  id: 'workspace-switcher',
  metadata: { nestable: true },
}
