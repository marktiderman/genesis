import { useState } from "react";
import {
  Users,
  DollarSign,
  TrendingUp,
  Package,
  ShoppingCart,
  Plus,
  Trash2,
  Inbox,
  Clock,
} from "lucide-react";

// UI components from @marktiderman/genesis-ui
import {
  Button,
  Badge,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Checkbox,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
  Progress,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Separator,
  Tooltip,
} from "@marktiderman/genesis-ui";

// Data components from @marktiderman/genesis-ui/data
import {
  StatCard,
  DataTable,
  DataGrid,
  DataList,
  KanbanBoard,
  DataPageShell,
  DataFilters,
  ViewToggle,
  EmptyState,
} from "@marktiderman/genesis-ui/data";
import type { DataTableColumn, KanbanColumn, ViewMode } from "@marktiderman/genesis-ui/data";

/* ---- Section wrapper ---- */

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-8">
      <h2 className="text-xl font-bold tracking-tight mb-4">{title}</h2>
      {children}
    </section>
  );
}

function PropBlock({ children }: { children: string }) {
  return (
    <pre className="mt-3 rounded-lg bg-muted/60 border p-3 text-xs font-mono text-muted-foreground overflow-x-auto">
      {children}
    </pre>
  );
}

/* ---- Sample data ---- */

interface SampleItem {
  id: string;
  name: string;
  status: string;
  category: string;
  date: string;
}

const sampleItems: SampleItem[] = [
  { id: "1", name: "Wireless Headphones", status: "Active", category: "Electronics", date: "2026-04-01" },
  { id: "2", name: "Leather Notebook", status: "Draft", category: "Stationery", date: "2026-03-28" },
  { id: "3", name: "Running Shoes", status: "Active", category: "Apparel", date: "2026-03-20" },
  { id: "4", name: "Ceramic Mug", status: "Archived", category: "Kitchen", date: "2026-03-15" },
  { id: "5", name: "Desk Lamp", status: "Active", category: "Office", date: "2026-03-10" },
];

const sampleColumns: DataTableColumn<SampleItem>[] = [
  { key: "name", header: "Name", sortable: true },
  { key: "status", header: "Status", sortable: true, render: (_item, val) => (
    <Badge variant={val === "Active" ? "success" : val === "Draft" ? "warning" : "muted"}>
      {String(val)}
    </Badge>
  )},
  { key: "category", header: "Category", sortable: true },
  { key: "date", header: "Date", sortable: true, hideBelow: "sm" },
];

/* ---- Kanban sample data ---- */

interface KanbanItem {
  id: string;
  title: string;
  assignee: string;
}

const kanbanColumns: KanbanColumn<KanbanItem>[] = [
  {
    key: "todo",
    label: "To Do",
    status: "neutral",
    items: [
      { id: "k1", title: "Research competitors", assignee: "Alice" },
      { id: "k2", title: "Write docs", assignee: "Bob" },
    ],
  },
  {
    key: "in-progress",
    label: "In Progress",
    status: "warning",
    items: [
      { id: "k3", title: "Build dashboard", assignee: "Carol" },
    ],
  },
  {
    key: "done",
    label: "Done",
    status: "success",
    items: [
      { id: "k4", title: "Setup CI/CD", assignee: "David" },
      { id: "k5", title: "Design tokens", assignee: "Eve" },
    ],
  },
];

/* ---- Main page ---- */

export default function DesignSystem() {
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [dsSearch, setDsSearch] = useState("");
  const [dsSort, setDsSort] = useState("name-asc");

  return (
    <div className="max-w-5xl mx-auto space-y-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Design System</h1>
        <p className="text-muted-foreground mt-1">
          Every Genesis component displayed atomically. Use this as a living style guide.
        </p>
      </div>

      {/* 1. Colors & Tokens */}
      <Section id="colors" title="1. Colors & Tokens">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { name: "Primary", var: "--primary", bg: "bg-primary", fg: "text-primary-foreground" },
            { name: "Secondary", var: "--secondary", bg: "bg-secondary", fg: "text-secondary-foreground" },
            { name: "Muted", var: "--muted", bg: "bg-muted", fg: "text-muted-foreground" },
            { name: "Accent", var: "--accent", bg: "bg-accent", fg: "text-accent-foreground" },
            { name: "Destructive", var: "--destructive", bg: "bg-destructive", fg: "text-destructive-foreground" },
            { name: "Background", var: "--background", bg: "bg-background", fg: "text-foreground" },
            { name: "Card", var: "--card", bg: "bg-card", fg: "text-card-foreground" },
            { name: "Border", var: "--border", bg: "bg-border", fg: "text-foreground" },
          ].map((c) => (
            <div key={c.name} className="space-y-1.5">
              <div className={`h-16 rounded-lg border ${c.bg} flex items-center justify-center`}>
                <span className={`text-xs font-medium ${c.fg}`}>{c.name}</span>
              </div>
              <p className="text-xs font-mono text-muted-foreground">{c.var}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { name: "Success", bg: "bg-success", value: "--success" },
            { name: "Warning", bg: "bg-warning", value: "--warning" },
            { name: "Error", bg: "bg-destructive", value: "--destructive" },
            { name: "Info", bg: "bg-info", value: "--info" },
          ].map((c) => (
            <div key={c.name} className="space-y-1.5">
              <div className={`h-16 rounded-lg ${c.bg} flex items-center justify-center`}>
                <span className="text-xs font-medium text-primary-foreground">{c.name}</span>
              </div>
              <p className="text-xs font-mono text-muted-foreground">{c.value}</p>
            </div>
          ))}
        </div>
        <PropBlock>{"CSS variables: var(--primary), var(--secondary), var(--muted), var(--accent), var(--destructive)"}</PropBlock>
      </Section>

      <Separator />

      {/* 2. Typography */}
      <Section id="typography" title="2. Typography">
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Font: Inter (body), Space Grotesk (headings via font-display)</p>
          {[
            { label: "text-3xl", cls: "text-3xl font-bold" },
            { label: "text-2xl", cls: "text-2xl font-bold" },
            { label: "text-xl", cls: "text-xl font-semibold" },
            { label: "text-lg", cls: "text-lg font-semibold" },
            { label: "text-base", cls: "text-base" },
            { label: "text-sm", cls: "text-sm" },
            { label: "text-xs", cls: "text-xs" },
          ].map((t) => (
            <div key={t.label} className="flex items-baseline gap-4">
              <code className="text-xs text-muted-foreground w-20 shrink-0">{t.label}</code>
              <p className={t.cls}>The quick brown fox jumps over the lazy dog</p>
            </div>
          ))}
        </div>
        <PropBlock>{"className=\"text-xs\" | \"text-sm\" | \"text-base\" | \"text-lg\" | \"text-xl\" | \"text-2xl\" | \"text-3xl\""}</PropBlock>
      </Section>

      <Separator />

      {/* 3. Buttons */}
      <Section id="buttons" title="3. Buttons">
        <div className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-2">Variants</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="default">Default</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="link">Link</Button>
            </div>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-2">Sizes</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm">Small</Button>
              <Button size="default">Default</Button>
              <Button size="lg">Large</Button>
              <Button size="icon"><Plus className="h-4 w-4" /></Button>
            </div>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-2">With icons</p>
            <div className="flex flex-wrap gap-2">
              <Button><Plus className="h-4 w-4" /> Create Item</Button>
              <Button variant="destructive"><Trash2 className="h-4 w-4" /> Delete</Button>
              <Button variant="outline" disabled>Disabled</Button>
            </div>
          </div>
        </div>
        <PropBlock>{'<Button variant="default|secondary|outline|ghost|destructive|link" size="sm|default|lg|icon" />'}</PropBlock>
      </Section>

      <Separator />

      {/* 4. Badges */}
      <Section id="badges" title="4. Badges">
        <div className="flex flex-wrap gap-2">
          <Badge variant="default">Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="success">Success</Badge>
          <Badge variant="warning">Warning</Badge>
          <Badge variant="info">Info</Badge>
          <Badge variant="muted">Muted</Badge>
        </div>
        <PropBlock>{'<Badge variant="default|secondary|destructive|outline|success|warning|info|muted" />'}</PropBlock>
      </Section>

      <Separator />

      {/* 5. Cards */}
      <Section id="cards" title="5. Cards">
        <div className="grid sm:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Card Title</CardTitle>
              <CardDescription>Card description goes here with supporting text.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm">This is the card content area. It can contain any elements.</p>
            </CardContent>
            <CardFooter className="gap-2">
              <Button size="sm">Save</Button>
              <Button size="sm" variant="outline">Cancel</Button>
            </CardFooter>
          </Card>
          <Card className="bg-muted/30">
            <CardHeader>
              <CardTitle className="text-lg">Compact Card</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Cards support any background and custom styling via className.</p>
            </CardContent>
          </Card>
        </div>
        <PropBlock>{"<Card> <CardHeader> <CardTitle /> <CardDescription /> </CardHeader> <CardContent /> <CardFooter /> </Card>"}</PropBlock>
      </Section>

      <Separator />

      {/* 6. StatCard */}
      <Section id="stat-card" title="6. StatCard">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Users" value="2,834" icon={Users} color="primary" trend={{ value: 12.5, label: "from last month" }} />
          <StatCard label="Revenue" value="$12,450" icon={DollarSign} color="success" trend={{ value: 8.1, label: "from last month" }} />
          <StatCard label="Orders" value="1,284" icon={ShoppingCart} color="warning" trend={{ value: -2.4, label: "from last month" }} />
          <StatCard label="Growth" value="18.2%" icon={TrendingUp} color="primary" href="/dashboard" />
        </div>
        <PropBlock>{'<StatCard label="..." value="..." icon={Icon} color="text-..." trend={{ value: 12, label: "..." }} href="/..." />'}</PropBlock>
      </Section>

      <Separator />

      {/* 7. Inputs & Forms */}
      <Section id="inputs" title="7. Inputs & Forms">
        <div className="max-w-md space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Text Input</label>
            <Input placeholder="Enter your name..." />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Select</label>
            <Select defaultValue="option1">
              <SelectTrigger>
                <SelectValue placeholder="Choose an option" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="option1">Option 1</SelectItem>
                <SelectItem value="option2">Option 2</SelectItem>
                <SelectItem value="option3">Option 3</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="terms" defaultChecked />
            <label htmlFor="terms" className="text-sm">Accept terms and conditions</label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="newsletter" />
            <label htmlFor="newsletter" className="text-sm">Subscribe to newsletter</label>
          </div>
        </div>
        <PropBlock>{"<Input /> <Select> <SelectTrigger /> <SelectContent> <SelectItem /> </SelectContent> </Select> <Checkbox />"}</PropBlock>
      </Section>

      <Separator />

      {/* 8. Dialog */}
      <Section id="dialog" title="8. Dialog">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">Open Dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Profile</DialogTitle>
              <DialogDescription>Make changes to your profile here. Click save when done.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <Input placeholder="Name" defaultValue="Mark Tiderman" />
              <Input placeholder="Email" defaultValue="mark@example.com" />
            </div>
            <DialogFooter>
              <Button variant="outline">Cancel</Button>
              <Button>Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <PropBlock>{"<Dialog> <DialogTrigger /> <DialogContent> <DialogHeader /> <DialogFooter /> </DialogContent> </Dialog>"}</PropBlock>
      </Section>

      <Separator />

      {/* 9. Alert Dialog */}
      <Section id="alert-dialog" title="9. Alert Dialog">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">Delete Account</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete your account and remove your data from our servers.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction>Yes, delete account</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <PropBlock>{"<AlertDialog> <AlertDialogTrigger /> <AlertDialogContent> ... <AlertDialogAction /> <AlertDialogCancel /> </AlertDialogContent> </AlertDialog>"}</PropBlock>
      </Section>

      <Separator />

      {/* 10. DataTable */}
      <Section id="data-table" title="10. DataTable">
        <DataTable
          items={sampleItems}
          columns={sampleColumns}
          getKey={(item) => item.id}
          pagination
          pageSize={5}
        />
        <PropBlock>{"<DataTable items={[...]} columns={[...]} getKey={(i) => i.id} pagination pageSize={25} selectable />"}</PropBlock>
      </Section>

      <Separator />

      {/* 11. DataGrid */}
      <Section id="data-grid" title="11. DataGrid">
        <DataGrid
          items={sampleItems.concat({ id: "6", name: "Yoga Mat", status: "Active", category: "Fitness", date: "2026-03-01" })}
          viewMode="grid"
          gridCols="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
          renderCard={(item) => (
            <Card className="h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{item.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <Badge variant={item.status === "Active" ? "success" : item.status === "Draft" ? "warning" : "muted"}>
                    {item.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{item.category}</span>
                </div>
              </CardContent>
            </Card>
          )}
          getKey={(item) => item.id}
        />
        <PropBlock>{"<DataGrid items={[...]} viewMode=\"grid\" renderCard={(item) => ...} renderTable={(items) => ...} renderListItem={(item) => ...} />"}</PropBlock>
      </Section>

      <Separator />

      {/* 12. DataList */}
      <Section id="data-list" title="12. DataList">
        <DataList
          items={sampleItems}
          renderItem={(item) => (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{item.name}</p>
                <p className="text-xs text-muted-foreground">{item.category} &middot; {item.date}</p>
              </div>
              <Badge variant={item.status === "Active" ? "success" : item.status === "Draft" ? "warning" : "muted"}>
                {item.status}
              </Badge>
            </div>
          )}
        />
        <PropBlock>{"<DataList items={[...]} renderItem={(item, index) => ...} emptyMessage=\"...\" />"}</PropBlock>
      </Section>

      <Separator />

      {/* 13. KanbanBoard */}
      <Section id="kanban" title="13. KanbanBoard">
        <KanbanBoard
          columns={kanbanColumns}
          renderCard={(item) => (
            <div className="rounded-lg border bg-card p-3 shadow-sm">
              <p className="text-sm font-medium">{item.title}</p>
              <p className="text-xs text-muted-foreground mt-1">{item.assignee}</p>
            </div>
          )}
        />
        <PropBlock>{"<KanbanBoard columns={[{ key, label, color, bgColor, items }]} renderCard={(item) => ...} />"}</PropBlock>
      </Section>

      <Separator />

      {/* 14. DataPageShell */}
      <Section id="data-page-shell" title="14. DataPageShell">
        <div className="rounded-lg border p-4 bg-muted/20">
          <DataPageShell
            title="Products"
            subtitle="Manage your product catalog"
            icon={Package}
            count={5}
            totalCount={12}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            createAction={<Button size="sm"><Plus className="h-4 w-4" /> New Product</Button>}
          >
            <p className="text-sm text-muted-foreground py-8 text-center">Content area goes here</p>
          </DataPageShell>
        </div>
        <PropBlock>{"<DataPageShell title=\"...\" subtitle=\"...\" icon={Icon} count={5} totalCount={12} viewMode={mode} onViewModeChange={setMode}> ... </DataPageShell>"}</PropBlock>
      </Section>

      <Separator />

      {/* 15. DataFilters */}
      <Section id="data-filters" title="15. DataFilters">
        <DataFilters
          search={dsSearch}
          onSearchChange={setDsSearch}
          searchPlaceholder="Search items..."
          sort={dsSort}
          onSortChange={setDsSort}
          sortOptions={[
            { value: "name-asc", label: "Name (A-Z)" },
            { value: "name-desc", label: "Name (Z-A)" },
            { value: "date-desc", label: "Newest first" },
            { value: "date-asc", label: "Oldest first" },
          ]}
          statusChips={{
            options: ["Active", "Draft", "Archived"],
            selected: [],
            onChange: () => {},
          }}
        />
        <PropBlock>{"<DataFilters search={...} onSearchChange={...} sort={...} onSortChange={...} sortOptions={[...]} filters={[...]} />"}</PropBlock>
      </Section>

      <Separator />

      {/* 16. ViewToggle */}
      <Section id="view-toggle" title="16. ViewToggle">
        <div className="flex items-center gap-4">
          <ViewToggle viewMode={viewMode} onViewModeChange={setViewMode} />
          <span className="text-sm text-muted-foreground">Current: {viewMode}</span>
        </div>
        <PropBlock>{'<ViewToggle viewMode="grid|table|list" onViewModeChange={(mode) => ...} />'}</PropBlock>
      </Section>

      <Separator />

      {/* 17. EmptyState */}
      <Section id="empty-state" title="17. EmptyState">
        <div className="rounded-lg border p-4">
          <EmptyState
            icon={Inbox}
            message="No items yet. Create your first one."
            action={<Button size="sm"><Plus className="h-4 w-4" /> Create Item</Button>}
          />
        </div>
        <PropBlock>{'<EmptyState icon={Icon} message="..." action={<Button>...</Button>} hasFilters onClearFilters={...} />'}</PropBlock>
      </Section>

      <Separator />

      {/* 18. Progress */}
      <Section id="progress" title="18. Progress">
        <div className="max-w-md space-y-3">
          {[0, 25, 50, 75, 100].map((val) => (
            <div key={val} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-8 text-right">{val}%</span>
              <Progress value={val} className="flex-1" />
            </div>
          ))}
        </div>
        <PropBlock>{"<Progress value={50} className=\"...\" />"}</PropBlock>
      </Section>

      <Separator />

      {/* 19. Skeleton */}
      <Section id="skeleton" title="19. Skeleton">
        <div className="space-y-3 max-w-md">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <div className="flex gap-3">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          </div>
        </div>
        <PropBlock>{"<Skeleton className=\"h-4 w-full\" /> -- animate-pulse rounded-md bg-muted"}</PropBlock>
      </Section>

      <Separator />

      {/* 20. Tabs */}
      <Section id="tabs" title="20. Tabs">
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm">Overview content goes here. This tab is currently selected.</p>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="analytics">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm">Analytics charts and data would appear here.</p>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="settings">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm">Settings form fields would appear here.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        <PropBlock>{"<Tabs defaultValue=\"...\"> <TabsList> <TabsTrigger value=\"...\" /> </TabsList> <TabsContent value=\"...\"> ... </TabsContent> </Tabs>"}</PropBlock>
      </Section>

      <Separator />

      {/* 21. Separator */}
      <Section id="separator" title="21. Separator">
        <div className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-2">Horizontal</p>
            <Separator />
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-2">Vertical (inside a flex container)</p>
            <div className="flex items-center gap-4 h-8">
              <span className="text-sm">Left</span>
              <Separator orientation="vertical" />
              <span className="text-sm">Center</span>
              <Separator orientation="vertical" />
              <span className="text-sm">Right</span>
            </div>
          </div>
        </div>
        <PropBlock>{'<Separator orientation="horizontal|vertical" />'}</PropBlock>
      </Section>

      <Separator />

      {/* 22. Tooltip */}
      <Section id="tooltip" title="22. Tooltip">
        <div className="flex flex-wrap gap-4 py-4">
          <Tooltip content="This is a tooltip" side="top">
            <Button variant="outline">Hover me (top)</Button>
          </Tooltip>
          <Tooltip content="Bottom tooltip" side="bottom">
            <Button variant="outline">Hover me (bottom)</Button>
          </Tooltip>
          <Tooltip content="Left tooltip" side="left">
            <Button variant="outline">Hover me (left)</Button>
          </Tooltip>
          <Tooltip content="Right tooltip" side="right">
            <Button variant="outline">Hover me (right)</Button>
          </Tooltip>
        </div>
        <PropBlock>{'<Tooltip content="..." side="top|bottom|left|right"> <children /> </Tooltip>'}</PropBlock>
      </Section>
    </div>
  );
}
