import type { Meta, StoryObj } from "@storybook/react-vite";
import { EventCalendar, type CalendarEvent, type CalendarLane } from "@marktiderman/genesis-ui/data";

const lanes: CalendarLane[] = [
  { key: "ana", label: "Ana", color: "var(--chart-1)" },
  { key: "ben", label: "Ben", color: "var(--chart-2)" },
  { key: "cy", label: "Cy", color: "var(--chart-3)" },
];

const events: CalendarEvent[] = [
  { key: "dinner", title: "Dinner out", start: new Date("2026-11-03T01:30:00Z"), end: new Date("2026-11-03T03:00:00Z"), lanes: ["ana", "ben"] },
  { key: "camp", title: "Camp", start: "2026-11-05", end: "2026-11-07", lanes: ["ben"] },
  { key: "dentist", title: "Dentist", start: new Date("2026-11-04T16:00:00Z"), lanes: ["ana"] },
  { key: "recital", title: "Recital", start: new Date("2026-11-10T01:00:00Z"), lanes: ["ana", "ben", "cy"] },
  { key: "bins", title: "Bins out", start: "2026-11-09" },
];

const meta: Meta<typeof EventCalendar> = {
  title: "Data/EventCalendar",
  component: EventCalendar,
  parameters: { layout: "padded" },
  args: { events, lanes, anchor: "2026-11-04", weekStartsOn: 0, timeZone: "America/Denver", onSelect: () => {} },
  argTypes: {
    layout: { control: { type: "select" }, options: ["month", "weeks", "agenda", "lanes"] },
    weeks: { control: { type: "select" }, options: [1, 2, 3, 4] },
  },
};
export default meta;
type Story = StoryObj<typeof EventCalendar>;

export const Month: Story = { args: { layout: "month" } };
export const TwoWeeks: Story = { args: { layout: "weeks", weeks: 2 } };
export const Agenda: Story = { args: { layout: "agenda", weeks: 2 } };
export const Lanes: Story = { args: { layout: "lanes", weeks: 2 } };
