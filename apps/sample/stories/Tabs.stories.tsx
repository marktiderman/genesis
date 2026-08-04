import type { Meta, StoryObj } from "@storybook/react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@marktiderman/genesis-ui";

const meta: Meta<typeof Tabs> = {
  title: "UI/Tabs",
  component: Tabs,
};
export default meta;
type Story = StoryObj<typeof Tabs>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="account" style={{ width: 400 }}>
      <TabsList>
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="password">Password</TabsTrigger>
        <TabsTrigger value="team">Team</TabsTrigger>
      </TabsList>
      <TabsContent value="account">
        Make changes to your account here. Click save when you're done.
      </TabsContent>
      <TabsContent value="password">Change your password.</TabsContent>
      <TabsContent value="team">Manage your team members.</TabsContent>
    </Tabs>
  ),
};

export const Disabled: Story = {
  render: () => (
    <Tabs defaultValue="active" style={{ width: 400 }}>
      <TabsList>
        <TabsTrigger value="active">Active</TabsTrigger>
        <TabsTrigger value="locked" disabled>
          Locked
        </TabsTrigger>
      </TabsList>
      <TabsContent value="active">Active tab content.</TabsContent>
    </Tabs>
  ),
};
