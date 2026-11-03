// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=60-252
// source=packages/ui/src/components/data/StatCard.tsx
// component=StatCard
// The "Icon" instance swap is a Lucide icon component in code, so the example uses a
// placeholder `icon={Users}`; swap it for the icon the designer picked.
import figma from 'figma'
const instance = figma.selectedInstance

const color = instance.getEnum('color', {
  primary: 'primary',
  success: 'success',
  warning: 'warning',
  info: 'info',
  destructive: 'destructive',
  muted: 'muted',
})
const label = instance.getString('Label')
const value = instance.getString('Value')
const showTrend = instance.getBoolean('Show trend')

export default {
  example: figma.code`<StatCard
  label="${label}"
  value="${value}"
  icon={Users}
  color="${color}"${showTrend ? figma.code`
  trend={{ value: 12, label: "vs last month" }}` : ''}
/>`,
  imports: ['import { StatCard } from "@marktiderman/genesis-ui/data"', 'import { Users } from "lucide-react"'],
  id: 'stat-card',
  metadata: { nestable: true },
}
