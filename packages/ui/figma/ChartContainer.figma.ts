// url=https://www.figma.com/design/oxxjVBFCphWPA3Bbj1Ivzf/Genesis?node-id=71-454
// source=packages/ui/src/components/ui/chart.tsx
// component=ChartContainer
// The container wraps a recharts chart; the type property picks which chart the example shows.
import figma from 'figma'
const instance = figma.selectedInstance

const type = instance.getEnum('type', { bar: 'bar', line: 'line', area: 'area' })

const charts = {
  bar: figma.code`<BarChart data={data}>
    <Bar dataKey="value" fill="var(--color-value)" />
  </BarChart>`,
  line: figma.code`<LineChart data={data}>
    <Line dataKey="value" stroke="var(--color-value)" />
  </LineChart>`,
  area: figma.code`<AreaChart data={data}>
    <Area dataKey="value" stroke="var(--color-value)" fill="var(--color-value)" />
  </AreaChart>`,
}

export default {
  example: figma.code`<ChartContainer config={chartConfig}>
  ${charts[type]}
</ChartContainer>`,
  imports: [
    'import { ChartContainer } from "@marktiderman/genesis-ui"',
    'import { Area, AreaChart, Bar, BarChart, Line, LineChart } from "recharts"',
  ],
  id: 'chart-container',
  metadata: { nestable: true },
}
