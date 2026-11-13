import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { NotificationsPage, UserAvatar, type NotificationItem } from "@marktiderman/genesis-ui";

const meta: Meta<typeof NotificationsPage> = { title: "Foundation/Layouts/NotificationsPage", component: NotificationsPage };
export default meta;
type Story = StoryObj<typeof NotificationsPage>;

const now = new Date();
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

export const Default: Story = {
  render: () => {
    const [items, setItems] = useState<NotificationItem[]>([
      { id: "1", title: "Ada booked Tuesday's class", timestamp: hoursAgo(1), unread: true, leading: <UserAvatar name="Ada Lovelace" size="sm" />, onPress: () => {} },
      { id: "2", title: "Your plan renews on Friday", body: "Monthly, $20", timestamp: hoursAgo(2) },
      { id: "3", title: "Class moved to 6pm", timestamp: hoursAgo(30) },
      { id: "4", title: "Welcome to Acme", timestamp: hoursAgo(24 * 10) },
    ]);
    return (
      <div className="w-[32rem]">
        <NotificationsPage items={items} onMarkAllRead={() => setItems((xs) => xs.map((x) => ({ ...x, unread: false })))} />
      </div>
    );
  },
};

export const Empty: Story = { render: () => <NotificationsPage items={[]} /> };
