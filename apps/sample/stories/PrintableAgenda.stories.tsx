import type { Meta, StoryObj } from "@storybook/react-vite";
import { PrintableAgenda, PrintButton, type CalendarEvent, type CalendarLane } from "@marktiderman/genesis-ui/data";

const lanes: CalendarLane[] = [
  { key: "ana", label: "Ana", color: "var(--chart-1)" },
  { key: "ben", label: "Ben", color: "var(--chart-2)" },
];

const events: CalendarEvent[] = [
  { key: "dinner", title: "Dinner out", start: new Date("2026-11-03T01:30:00Z"), end: new Date("2026-11-03T03:00:00Z"), lanes: ["ana", "ben"] },
  { key: "camp", title: "Camp", start: "2026-11-05", end: "2026-11-07", lanes: ["ben"] },
  { key: "dentist", title: "Dentist", start: new Date("2026-11-04T16:00:00Z"), lanes: ["ana"] },
];

const meta: Meta<typeof PrintableAgenda> = {
  title: "Data/PrintableAgenda",
  component: PrintableAgenda,
  parameters: { layout: "padded" },
  args: { events, lanes, anchor: "2026-11-04", weekStartsOn: 0, timeZone: "America/Denver" },
};
export default meta;
type Story = StoryObj<typeof PrintableAgenda>;

/** One printed week per lane, with the button that prints them. */
export const OneSheetPerPerson: Story = {
  render: (args) => (
    <div className="space-y-4">
      <PrintButton />
      <PrintableAgenda {...args} />
    </div>
  ),
};
