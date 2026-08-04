import type { Meta, StoryObj } from "@storybook/react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@marktiderman/genesis-ui";

const meta: Meta<typeof ChartContainer> = {
  title: "UI/Chart",
  component: ChartContainer,
};
export default meta;
type Story = StoryObj<typeof ChartContainer>;

const chartData = [
  { month: "Jan", sessions: 186 },
  { month: "Feb", sessions: 305 },
  { month: "Mar", sessions: 237 },
  { month: "Apr", sessions: 273 },
  { month: "May", sessions: 312 },
];

const chartConfig = {
  sessions: { label: "Sessions", color: "hsl(var(--chart-1))" },
} satisfies ChartConfig;

export const Default: Story = {
  render: () => (
    <ChartContainer config={chartConfig} className="h-[240px] w-[360px]">
      <BarChart data={chartData}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="sessions" fill="var(--color-sessions)" radius={4} />
      </BarChart>
    </ChartContainer>
  ),
};
