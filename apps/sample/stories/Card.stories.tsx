import type { Meta, StoryObj } from "@storybook/react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
} from "@marktiderman/genesis-ui";

const meta: Meta<typeof Card> = {
  title: "UI/Card",
  component: Card,
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Basic: Story = {
  render: () => (
    <Card style={{ width: 360 }}>
      <CardHeader>
        <CardTitle>Basic card</CardTitle>
        <CardDescription>Header + description.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Body text inside card content.
        </p>
      </CardContent>
    </Card>
  ),
};

export const WithFooter: Story = {
  render: () => (
    <Card style={{ width: 360 }}>
      <CardHeader>
        <CardTitle>With footer</CardTitle>
        <CardDescription>Composed action footer.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          A common pattern: card with primary action below.
        </p>
      </CardContent>
      <CardFooter>
        <Button size="sm" variant="outline">
          Cancel
        </Button>
        <Button size="sm">Save</Button>
      </CardFooter>
    </Card>
  ),
};

export const Minimal: Story = {
  render: () => (
    <Card style={{ width: 360 }}>
      <CardContent>
        <p className="text-sm">Content only.</p>
      </CardContent>
    </Card>
  ),
};

// Alias so `/showcase/primitives/card` has a `ui-card--default` story to
// link to — every showcase entry expects one, and this file's most
// representative variant is `Basic`.
export const Default = Basic;
