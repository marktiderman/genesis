// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=59-424
// source=packages/ui/src/components/ui/button.tsx
// component=Button
// The Icon swap property is a slot for any icon, not a Genesis prop: the example shows <Icon />
// where the designer swapped one in. Hover, focus and pressed are interaction, not emitted.
import figma from 'figma'
const instance = figma.selectedInstance

const variant = instance.getEnum('variant', { default: 'default', destructive: 'destructive', outline: 'outline', secondary: 'secondary', ghost: 'ghost', link: 'link' })
const size = instance.getEnum('size', { default: 'default', sm: 'sm', lg: 'lg', icon: 'icon' })
const label = instance.getString('Label')
const loading = instance.getBoolean('Loading')
const showStartIcon = instance.getBoolean('Show start icon')

export default {
  example: size === 'icon'
    ? figma.code`<Button variant="${variant}" size="icon" aria-label="${label}"${loading ? ' loading' : ''}>
  <Icon />
</Button>`
    : figma.code`<Button variant="${variant}" size="${size}"${loading ? ' loading' : ''}${showStartIcon ? ' startIcon={<Icon />}' : ''} onClick={handleClick}>
  ${label}
</Button>`,
  imports: ['import { Button } from "@marktiderman/genesis-ui"'],
  id: 'button',
  metadata: { nestable: true },
}
