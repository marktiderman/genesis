/** Live examples of the Genesis page layouts, for /showcase/layouts/:slug. */
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Textarea } from "@marktiderman/genesis-ui";
import { DashboardPage } from "@marktiderman/genesis-ui/dashboard-page";
import { SettingsPage } from "@marktiderman/genesis-ui/settings-page";
import { FormPage } from "@marktiderman/genesis-ui/form-page";
import { DetailPage } from "@marktiderman/genesis-ui/detail-page";
import { SettingsRow } from "@marktiderman/genesis-ui/settings-row";
import { ToggleRow } from "@marktiderman/genesis-ui/toggle-row";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

export function DashboardExample() {
  return (
    <DashboardPage
      title="This week"
      subtitle="Bookings and revenue across the studio."
      actions={<Button size="sm">New booking</Button>}
      stats={[
        <Stat key="b" label="Bookings" value="128" />,
        <Stat key="r" label="Revenue" value="$9,420" />,
        <Stat key="n" label="New clients" value="14" />,
      ]}
    >
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">The page's own content goes here.</CardContent>
      </Card>
    </DashboardPage>
  );
}

export function SettingsExample() {
  return (
    <SettingsPage
      title="Settings"
      description="How the workspace looks and who hears about what."
      sections={[
        {
          id: "general",
          title: "General",
          content: (
            <SettingsRow label="Workspace name" htmlFor="ws-name">
              <Input id="ws-name" defaultValue="Harbor Studio" />
            </SettingsRow>
          ),
        },
        {
          id: "notifications",
          title: "Notifications",
          content: (
            <>
              <ToggleRow label="Email me new bookings" defaultChecked />
              <ToggleRow label="Weekly summary" description="Every Monday morning." />
            </>
          ),
        },
      ]}
    />
  );
}

export function FormExample() {
  return (
    <FormPage
      title="New client"
      description="Add someone to the workspace."
      actions={
        <>
          <Button variant="outline">Cancel</Button>
          <Button>Save</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="client-name">Name</Label>
          <Input id="client-name" placeholder="Jordan Lee" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="client-notes">Notes</Label>
          <Textarea id="client-notes" />
        </div>
      </div>
    </FormPage>
  );
}

export function DetailExample() {
  return (
    <DetailPage
      title="Jordan Lee"
      subtitle="Client since March"
      actions={<Button size="sm" variant="outline">Edit</Button>}
      sidebar={
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contact</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">jordan@example.com</CardContent>
        </Card>
      }
    >
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">The record's body: activity, notes, child lists.</CardContent>
      </Card>
    </DetailPage>
  );
}

export const LAYOUT_EXAMPLES: Record<string, () => React.JSX.Element> = {
  dashboard: DashboardExample,
  settings: SettingsExample,
  form: FormExample,
  detail: DetailExample,
};
