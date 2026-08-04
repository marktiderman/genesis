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
} from "@marktiderman/genesis-ui";
import { Stack, Section } from "@marktiderman/genesis-ui/layout";
import {
  ResourceForm,
  ResourceDetailPage,
  DataBulkBar,
  FilterCombobox,
  DataTable,
  ViewSettings,
  DetailPanel,
  DateCell,
  NumberCell,
  CurrencyCell,
  BadgeCell,
  type FilterOption,
  type DataTableColumn,
} from "@marktiderman/genesis-ui/data";
import type { Density } from "@marktiderman/genesis-ui/hooks";
import { ArrowLeft, Archive, Trash2, Tag } from "lucide-react";
import { DATA_CARDS } from "../lib/portfolio-data";
import { findPrimitive } from "../lib/primitive-docs";
import { items } from "../lib/data";
import {
  StabilityBadge,
  ImportCard,
  ExportsCard,
  ComponentsCard,
  StorybookCard,
  LiveDemoLinksCard,
} from "../components/reference-blocks";

/** Routes that already demonstrate a given data component in a realistic,
 * fully-wired page — linked instead of re-demoing the same component here. */
const SEE_LIVE: Record<string, { label: string; to: string }[]> = {
  "resource-page": [
    { label: "Items (L1)", to: "/items" },
    { label: "Tasks", to: "/tasks" },
    { label: "Orders", to: "/orders" },
    { label: "Sandbox configurator", to: "/sandbox" },
  ],
  "data-page-shell": [{ label: "Items (L2)", to: "/items-custom" }],
  "data-filters": [{ label: "Items (L2)", to: "/items-custom" }],
  "data-grid": [{ label: "Items (L2)", to: "/items-custom" }],
  "data-table": [{ label: "Items (L2)", to: "/items-custom" }],
  "data-list": [{ label: "Dashboard", to: "/dashboard" }],
  "kanban-board": [{ label: "Dashboard", to: "/dashboard" }],
  "stat-card": [{ label: "Dashboard", to: "/dashboard" }],
  "view-toggle": [{ label: "Items (L2)", to: "/items-custom" }],
};

// ---------------------------------------------------------------------------
// Live examples — the components with no full-page demo elsewhere.
// ---------------------------------------------------------------------------

function ResourceDetailPageExample() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="pt-6">
        <ResourceDetailPage
          resource="items"
          id="1"
          breadcrumb={<span className="text-xs text-muted-foreground">Items / #1</span>}
          actions={() => (
            <Button size="sm" variant="outline">
              Edit
            </Button>
          )}
          sidebar={(record) => (
            <Stack gap="lg">
              <SettingsRow label="Status">{String(record.status)}</SettingsRow>
              <SettingsRow label="Category">{String(record.category)}</SettingsRow>
              <SettingsRow label="Price">{String(record.price)}</SettingsRow>
            </Stack>
          )}
        >
          {(record) => (
            <Section title="Overview">
              <p className="text-sm text-muted-foreground">
                {String(record.name)} was added {String(record.created)}.
              </p>
            </Section>
          )}
        </ResourceDetailPage>
      </CardContent>
    </Card>
  );
}

function ResourceFormExample() {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <p className="text-sm text-muted-foreground">
          One form config, three field types this app doesn&apos;t otherwise
          demo: a relation lookup, a file drop zone, and a repeatable field
          array.
        </p>
        <Button onClick={() => setOpen(true)} testID="resource-form-example-trigger">
          Open form
        </Button>
        <ResourceForm
          resource="items"
          action="create"
          open={open}
          onOpenChange={setOpen}
          title="New project brief"
          columns={2}
          fields={[
            { key: "name", label: "Title", required: true, group: "Basics" },
            {
              key: "category",
              label: "Category",
              type: "select",
              group: "Basics",
              options: [
                { value: "Electronics", label: "Electronics" },
                { value: "Stationery", label: "Stationery" },
                { value: "Apparel", label: "Apparel" },
              ],
            },
            {
              key: "relatedItem",
              label: "Related item",
              type: "relation",
              group: "Basics",
              colSpan: 2,
              relation: { resource: "items", labelField: "name", searchable: true },
            },
            {
              key: "attachment",
              label: "Attachment",
              type: "file",
              group: "Attachment",
              colSpan: 2,
              description: "Any file up to 10MB.",
            },
            {
              key: "milestones",
              label: "Milestones",
              type: "array",
              group: "Milestones",
              colSpan: 2,
              arrayFields: [
                { key: "label", label: "Label" },
                { key: "dueDate", label: "Due date", type: "date" },
              ],
            },
          ]}
          onSuccess={() => setOpen(false)}
        />
      </CardContent>
    </Card>
  );
}

function WizardFormExample() {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <p className="text-sm text-muted-foreground">
          The same <code className="text-xs bg-muted px-1 rounded">ResourceForm</code> engine,
          split into steps via <code className="text-xs bg-muted px-1 rounded">mode=&quot;wizard&quot;</code> —
          this is what renders <code className="text-xs bg-muted px-1 rounded">WizardForm</code> under
          the hood.
        </p>
        <Button onClick={() => setOpen(true)} testID="wizard-form-example-trigger">
          Open wizard
        </Button>
        <ResourceForm
          resource="items"
          action="create"
          open={open}
          onOpenChange={setOpen}
          title="New item"
          mode="wizard"
          steps={[
            { id: "basics", title: "Basics", description: "What is it?", fields: ["name", "category"] },
            { id: "pricing", title: "Pricing", description: "What does it cost?", fields: ["price"] },
          ]}
          fields={[
            { key: "name", label: "Name", required: true },
            {
              key: "category",
              label: "Category",
              type: "select",
              options: [
                { value: "Electronics", label: "Electronics" },
                { value: "Stationery", label: "Stationery" },
              ],
            },
            { key: "price", label: "Price", type: "number" },
          ]}
          onSuccess={() => setOpen(false)}
        />
      </CardContent>
    </Card>
  );
}

function DataBulkBarExample() {
  const [selected, setSelected] = useState<Set<string>>(new Set(["1", "2"]));
  const demoItems = items.slice(0, 4);

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <DataBulkBar
          selected={selected}
          totalCount={demoItems.length}
          onToggleAll={() =>
            setSelected((prev) =>
              prev.size === demoItems.length ? new Set() : new Set(demoItems.map((i) => i.id)),
            )
          }
          onClearSelection={() => setSelected(new Set())}
          actions={[
            { label: "Archive", icon: Archive, onClick: () => console.log("Archive", [...selected]) },
            { label: "Delete", icon: Trash2, variant: "destructive", onClick: () => console.log("Delete", [...selected]) },
          ]}
        />
        <div className="space-y-1">
          {demoItems.map((item) => (
            <label
              key={item.id}
              className="flex items-center gap-2 rounded-md border p-2 text-sm"
            >
              <input
                type="checkbox"
                checked={selected.has(item.id)}
                onChange={() => toggleOne(item.id)}
                className="h-4 w-4"
              />
              {item.name}
            </label>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function FilterComboboxExample() {
  const [selected, setSelected] = useState<string[]>(["Active"]);
  const options: FilterOption[] = [
    { value: "Active", count: 5 },
    { value: "Draft", count: 2 },
    { value: "Archived", count: 1 },
  ];
  return (
    <Card>
      <CardContent className="pt-6 flex flex-wrap items-center gap-3">
        <FilterCombobox
          label="Status"
          icon={Tag}
          options={options}
          selected={selected}
          onChange={setSelected}
        />
        <span className="text-xs text-muted-foreground">
          Selected: {selected.length ? selected.join(", ") : "none"}
        </span>
      </CardContent>
    </Card>
  );
}

interface FormattedRow {
  id: string;
  updated: string;
  units: number;
  total: string;
  status: string;
}

const formattedRows: FormattedRow[] = [
  { id: "1", updated: "2026-04-10", units: 1284, total: "450.00", status: "Active" },
  { id: "2", updated: "2026-03-02", units: 42, total: "125.50", status: "Draft" },
  { id: "3", updated: "2026-01-20", units: 6, total: "0.00", status: "Archived" },
];

const formattedColumns: DataTableColumn<FormattedRow>[] = [
  { key: "updated", header: "Updated", render: DateCell({ relative: true }) },
  { key: "units", header: "Units", render: NumberCell() },
  { key: "total", header: "Total", render: CurrencyCell("USD") },
  {
    key: "status",
    header: "Status",
    render: BadgeCell({ Active: "success", Draft: "warning", Archived: "muted" }),
  },
];

function CellFormattersExample() {
  return (
    <Card>
      <CardContent className="pt-6">
        <DataTable items={formattedRows} columns={formattedColumns} getKey={(r) => r.id} />
      </CardContent>
    </Card>
  );
}

function ViewSettingsExample() {
  const [pageSize, setPageSize] = useState(25);
  const [density, setDensity] = useState<Density>("comfortable");
  return (
    <Card>
      <CardContent className="pt-6 flex items-center gap-3">
        <ViewSettings
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          density={density}
          onDensityChange={setDensity}
        />
        <span className="text-sm text-muted-foreground">
          {pageSize} per page &middot; {density}
        </span>
      </CardContent>
    </Card>
  );
}

interface DetailPanelContact extends Record<string, unknown> {
  id: string;
  name: string;
  role: string;
  email: string;
  status: string;
}

const detailPanelContact: DetailPanelContact = {
  id: "1",
  name: "Priya Natarajan",
  role: "Head of Partnerships",
  email: "priya@example.com",
  status: "Active",
};

function DetailPanelExample() {
  const [open, setOpen] = useState(false);
  const contact = detailPanelContact;
  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <Button onClick={() => setOpen(true)} testID="detail-panel-example-trigger">
          View contact
        </Button>
        <DetailPanel
          layout="sheet"
          item={contact}
          open={open}
          onClose={() => setOpen(false)}
          title={contact.name}
          subtitle={contact.role}
          fields={[
            { key: "role", label: "Role" },
            { key: "email", label: "Email" },
            { key: "status", label: "Status" },
          ]}
          onEdit={() => setOpen(true)}
          width="md"
        />
      </CardContent>
    </Card>
  );
}

const LIVE_EXAMPLES: Record<string, () => ReactNode> = {
  "resource-detail-page": ResourceDetailPageExample,
  "resource-form": ResourceFormExample,
  "wizard-form": WizardFormExample,
  "data-bulk-bar": DataBulkBarExample,
  "filter-combobox": FilterComboboxExample,
  "cell-formatters": CellFormattersExample,
  "view-settings": ViewSettingsExample,
  "detail-panel": DetailPanelExample,
};

export default function DataDetail() {
  const { slug = "" } = useParams<{ slug: string }>();
  const card = DATA_CARDS.find((d) => d.slug === slug);
  const doc = findPrimitive(slug);
  const Example = LIVE_EXAMPLES[slug];
  const seeLive = SEE_LIVE[slug];

  const stability = doc?.stability ?? card?.stability;
  const label = card?.label ?? doc?.primaryComponent ?? slug;
  const blurb = card?.blurb ?? doc?.summary ?? "";
  // Like /showcase/layouts: DetailPanel is the only data-tier entry with
  // `hasStory: true`, its story predates this catalog, and it has no
  // `Default` export (`Sheet` / `Dialog` / `Inline` instead) — so it sets
  // `card.storyId` explicitly rather than relying on a derived id.
  const storyId = card?.storyId ?? "";

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-6" data-testid={`data-detail-${slug}`}>
      <Link
        to="/showcase/data"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> Data &amp; Resources
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

          {seeLive ? <LiveDemoLinksCard links={seeLive} /> : null}

          {doc ? <ImportCard doc={doc} /> : null}
          {card ? <ExportsCard exports={card.exports} /> : null}
          {doc ? <ComponentsCard doc={doc} /> : null}
          {card?.hasStory && storyId ? <StorybookCard storyId={storyId} /> : null}
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Unknown data component</CardTitle>
            <CardDescription>Slug: {slug}</CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
