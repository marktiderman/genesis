// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=60-369
// source=packages/ui/src/components/ui/skeleton.tsx
// component=Skeleton
// Skeleton has no Figma properties; its size comes from the className the screen gives it.
import figma from 'figma'

export default {
  example: figma.code`<Skeleton className="h-4 w-48" />`,
  imports: ['import { Skeleton } from "@marktiderman/genesis-ui"'],
  id: 'skeleton',
  metadata: { nestable: true },
}
