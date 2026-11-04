import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within, screen } from "storybook/test";
import { Bell, Calendar, Home, Inbox, Settings, Users, BarChart3 } from "lucide-react";
import { TabBar, type TabBarItem } from "@marktiderman/genesis-ui/layout";

const ALL: TabBarItem[] = [
  { key: "home", label: "Home", icon: <Home /> },
  { key: "inbox", label: "Inbox", icon: <Inbox />, badge: 3 },
  { key: "calendar", label: "Calendar", icon: <Calendar /> },
  { key: "people", label: "People", icon: <Users /> },
  { key: "reports", label: "Reports", icon: <BarChart3 /> },
  { key: "alerts", label: "Alerts", icon: <Bell /> },
  { key: "settings", label: "Settings", icon: <Settings /> },
];

function Demo({ count }: { count: number }) {
  const [value, setValue] = useState("home");
  return (
    <div style={{ maxWidth: 390 }}>
      <p data-testid="tab-bar-current">{value}</p>
      <TabBar items={ALL.slice(0, count)} value={value} onChange={setValue} />
    </div>
  );
}

const meta: Meta<typeof Demo> = {
  title: "Layout/TabBar",
  component: Demo,
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
export default meta;
type Story = StoryObj<typeof Demo>;

export const FiveTabs: Story = { args: { count: 5 } };

/** Seven tabs: four show, and More opens Reports, Alerts and Settings in a sheet. */
export const WithMore: Story = {
  args: { count: 7 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByTestId("tab-bar-more"));
    await userEvent.click(await screen.findByRole("button", { name: "Settings" }));
    await expect(canvas.getByTestId("tab-bar-current")).toHaveTextContent("settings");
  },
};
