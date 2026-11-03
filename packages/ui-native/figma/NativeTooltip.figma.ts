// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=40-79
// source=packages/ui-native/src/components/tooltip.tsx
// component=NativeTooltip
import figma from 'figma'
const instance = figma.selectedInstance

const label = instance.getString('Label')

export default {
  example: figma.code`<NativeTooltip>
  <NativeTooltipTrigger>
    {children}
  </NativeTooltipTrigger>
  <NativeTooltipContent>${label}</NativeTooltipContent>
</NativeTooltip>`,
  imports: ['import { NativeTooltip, NativeTooltipTrigger, NativeTooltipContent } from "@marktiderman/genesis-ui-native"'],
  id: 'native-tooltip',
  metadata: { nestable: false },
}
