// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=59-475
// source=packages/ui/src/components/resource/chip.tsx
// component=Chip
import figma from 'figma'
const instance = figma.selectedInstance

const tone = instance.getEnum('tone', { success: 'success', warning: 'warning', danger: 'danger', info: 'info', muted: 'muted' })
const selected = instance.getEnum('selected', { false: false, true: true })
const label = instance.getString('Label')
const showIcon = instance.getBoolean('Show icon')

export default {
  example: figma.code`<Chip tone="${tone}"${showIcon ? ' icon={<Icon />}' : ''}${selected ? ' selected onSelectedChange={setSelected}' : ''}>${label}</Chip>`,
  imports: ['import { Chip } from "@marktiderman/genesis-ui"'],
  id: 'chip',
  metadata: { nestable: true },
}
