// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=60-491
// source=packages/ui/src/components/ui/toggle.tsx
// component=Toggle
import figma from 'figma'
const instance = figma.selectedInstance

const variant = instance.getEnum('variant', { default: 'default', outline: 'outline' })
const pressed = instance.getEnum('pressed', { false: 'false', true: 'true' })
const size = instance.getEnum('size', { default: 'default', sm: 'sm', lg: 'lg' })
const label = instance.getString('Label')
const showIcon = instance.getBoolean('Show icon')

export default {
  example: figma.code`<Toggle variant="${variant}" size="${size}" pressed={${pressed}} onPressedChange={setPressed} aria-label="${label}">${showIcon ? `
  <Icon />` : ''}
  ${label}
</Toggle>`,
  imports: ['import { Toggle } from "@marktiderman/genesis-ui"'],
  id: 'toggle',
  metadata: { nestable: true },
}
