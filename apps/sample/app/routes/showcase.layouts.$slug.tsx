import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
  Button,
  SettingsRow,
  ToggleRow,
  Input,
} from "@marktiderman/genesis-ui";
import {
  Stack,
  Grid,
  Split,
  Section,
  Container,
  DetailPage,
  FormPage,
  DashboardPage,
  SettingsPage,
  PageHeader,
} from "@marktiderman/genesis-ui/layout";
import { StatCard } from "@marktiderman/genesis-ui/data";
import { FormField, FormLabel } from "@marktiderman/genesis-ui";
import { ArrowLeft, Users, Plus } from "lucide-react";
import { LAYOUT_CARDS } from "../lib/portfolio-data";
import { findPrimitive } from "../lib/primitive-docs";
import {
  StabilityBadge,
  ImportCard,
  ExportsCard,
  ComponentsCard,
  StorybookCard,
} from "../components/reference-blocks";

/** A dashed placeholder tile — stands in for "real" content in the layout
 * primitive demos below, so the layout itself (not its content) is what's
 * on display. */
function Placeholder({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function AppShellExample() {
  return (
    <p className="text-sm text-muted-foreground">
      You&apos;re looking at one right now — this showcase&apos;s sidebar,
      mobile bottom nav, and collapse control are all <code className="text-xs bg-muted px-1 rounded">AppShell</code>.
      Storybook has an isolated instance with the resizable rail and
      customize popover, below.
    </p>
  );
}

function PageHeaderExample() {
  return (
    <Card>
      <CardContent className="pt-6">
        <PageHeader
          title="Team members"
          subtitle="Everyone with access to this workspace."
          icon={Users}
          count={8}
          totalCount={12}
          entityName="member"
          createAction={
            <Button size="sm">
              <Plus className="h-4 w-4" /> Invite
            </Button>
          }
        />
      </CardContent>
    </Card>
  );
}

function DetailPageExample() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="pt-6">
        <DetailPage
          breadcrumb={
            <span className="text-xs text-muted-foreground">
              Contacts / Priya Natarajan
            </span>
          }
          title="Priya Natarajan"
          subtitle="Head of Partnerships"
          actions={
            <Button size="sm" variant="outline">
              Edit
            </Button>
          }
          sidebar={
            <Stack gap="lg">
              <StatCard label="Open deals" value={4} color="primary" />
              <SettingsRow label="Owner">Alex Chen</SettingsRow>
              <SettingsRow label="Status">Active</SettingsRow>
            </Stack>
          }
        >
          <Section title="Timeline">
            <Placeholder>Activity feed goes here.</Placeholder>
          </Section>
        </DetailPage>
      </CardContent>
    </Card>
  );
}

function FormPageExample() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="pt-6">
        <FormPage
          title="New engagement"
          description="Both the coach and the client will be notified."
          onSubmit={(e) => e.preventDefault()}
          actions={
            <>
              <Button variant="ghost" type="button">
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </>
          }
        >
          <Section title="Basics">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField>
                <FormLabel>Name</FormLabel>
                <Input placeholder="Jane Doe" />
              </FormField>
              <FormField>
                <FormLabel>Email</FormLabel>
                <Input placeholder="jane@example.com" type="email" />
              </FormField>
            </div>
          </Section>
        </FormPage>
      </CardContent>
    </Card>
  );
}

function DashboardPageExample() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="pt-6">
        <DashboardPage
          title="This quarter"
          subtitle="Apr 1 – Jun 30"
          stats={
            <>
              <StatCard label="Active clients" value={42} color="primary" />
              <StatCard
                label="Sessions"
                value={318}
                color="success"
                trend={{ value: 12, label: "vs last quarter" }}
              />
            </>
          }
          statColumns={2}
        >
          <Section title="Revenue">
            <Placeholder>Chart goes here.</Placeholder>
          </Section>
        </DashboardPage>
      </CardContent>
    </Card>
  );
}

function SettingsPageExample() {
  const [digest, setDigest] = useState(true);
  return (
    <Card className="overflow-hidden">
      <CardContent className="pt-6">
        <SettingsPage
          title="Workspace settings"
          sections={[
            {
              id: "profile",
              title: "Profile",
              content: (
                <SettingsRow label="Display name" htmlFor="layout-demo-name">
                  <Input id="layout-demo-name" defaultValue="Genesis" className="w-48" />
                </SettingsRow>
              ),
            },
            {
              id: "notifications",
              title: "Notifications",
              description: "How and when we contact you.",
              content: (
                <ToggleRow
                  label="Weekly digest"
                  description="A summary every Monday morning."
                  checked={digest}
                  onCheckedChange={setDigest}
                />
              ),
            },
          ]}
        />
      </CardContent>
    </Card>
  );
}

function StackExample() {
  return (
    <Card>
      <CardContent className="pt-6">
        <Stack gap="md">
          <Placeholder>Item 1</Placeholder>
          <Placeholder>Item 2</Placeholder>
          <Placeholder>Item 3</Placeholder>
        </Stack>
      </CardContent>
    </Card>
  );
}

function GridExample() {
  return (
    <Card>
      <CardContent className="pt-6">
        <Grid cols={3} gap="md">
          <Placeholder>1</Placeholder>
          <Placeholder>2</Placeholder>
          <Placeholder>3</Placeholder>
          <Placeholder>4</Placeholder>
          <Placeholder>5</Placeholder>
          <Placeholder>6</Placeholder>
        </Grid>
      </CardContent>
    </Card>
  );
}

function SplitExample() {
  return (
    <Card>
      <CardContent className="pt-6">
        <Split
          at="sm"
          ratio="1/2"
          gap="lg"
          start={<Placeholder>Start (master)</Placeholder>}
          end={<Placeholder>End (detail)</Placeholder>}
        />
      </CardContent>
    </Card>
  );
}

function SectionExample() {
  return (
    <Card>
      <CardContent className="pt-6">
        <Section
          title="Team members"
          description="Everyone with access to this workspace."
          actions={
            <Button size="sm" variant="outline">
              Add
            </Button>
          }
        >
          <Placeholder>Content goes here.</Placeholder>
        </Section>
      </CardContent>
    </Card>
  );
}

function ContainerExample() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 p-2">
      <Container size="sm" className="bg-background rounded-md py-4">
        <Placeholder>size=&quot;sm&quot; — centered, capped width</Placeholder>
      </Container>
    </div>
  );
}

const LIVE_EXAMPLES: Record<string, () => ReactNode> = {
  "app-shell": AppShellExample,
  "page-header": PageHeaderExample,
  "detail-page": DetailPageExample,
  "form-page": FormPageExample,
  "dashboard-page": DashboardPageExample,
  "settings-page": SettingsPageExample,
  stack: StackExample,
  grid: GridExample,
  split: SplitExample,
  section: SectionExample,
  container: ContainerExample,
};

export default function LayoutDetail() {
  const { slug = "" } = useParams<{ slug: string }>();
  const card = LAYOUT_CARDS.find((l) => l.slug === slug);
  const doc = findPrimitive(slug);
  const Example = LIVE_EXAMPLES[slug];

  const stability = doc?.stability ?? card?.stability;
  const label = card?.label ?? doc?.primaryComponent ?? slug;
  const blurb = card?.blurb ?? doc?.summary ?? "";
  // No generic fallback here, unlike /showcase/primitives: AppShell and
  // PageHeader (the only two layout-tier entries with `hasStory: true`)
  // predate this catalog, live under a "Layout/" title rather than "UI/",
  // and PageHeader has no `Default` export — so both set `card.storyId`
  // explicitly in portfolio-data.ts rather than relying on a derived id.
  const storyId = card?.storyId ?? "";

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-6" data-testid={`layout-detail-${slug}`}>
      <Link
        to="/showcase/layouts"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> Layouts
      </Link>

      {card || doc ? (
        <>
          <header className="space-y-2">
            <StabilityBadge stability={stability} />
            <h1 className="text-3xl font-bold tracking-tight">{label}</h1>
            {blurb ? <p className="text-muted-foreground">{blurb}</p> : null}
          </header>

          {Example ? (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Live example
              </h2>
              <Example />
            </section>
          ) : null}

          {doc ? <ImportCard doc={doc} /> : null}
          {card ? <ExportsCard exports={card.exports} /> : null}
          {doc ? <ComponentsCard doc={doc} /> : null}
          {card?.hasStory && storyId ? <StorybookCard storyId={storyId} /> : null}
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Unknown layout</CardTitle>
            <CardDescription>Slug: {slug}</CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
