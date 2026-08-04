import { useState, useMemo, useCallback } from "react";
import {
  Package,
  CheckSquare,
  Users,
  FileText,
  Inbox,
  Copy,
  Check,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ResourcePage } from "@marktiderman/genesis-ui/data";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Input,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Separator,
  Badge,
  Button,
  Checkbox,
} from "@marktiderman/genesis-ui";
import { items, tasks } from "../lib/data";
import type { Item, Task } from "../lib/data";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type DatasetKey = "items" | "tasks";

const iconMap: Record<string, LucideIcon> = {
  Package,
  CheckSquare,
  Users,
  FileText,
  Inbox,
};

const iconOptions = Object.keys(iconMap);

const itemColumnKeys = ["name", "status", "category", "price", "created"];
const taskColumnKeys = ["title", "status", "assignee", "priority"];

type DetailMode = "panel" | "modal" | "route" | "none";
type DetailWidth = "sm" | "md" | "lg";
type ViewMode = "table" | "grid" | "list";

/**
 * Grid-column ramps offered for `gridCols`, as a closed set rather than free
 * text. Tailwind v4 generates CSS only for class names it can find in the
 * source, so a class assembled at runtime (`grid-cols-` + a typed number)
 * resolves to nothing: no styles, no build error, no warning. Spelling the
 * options out here is what puts them in front of the scanner.
 */
const gridColsPresets = [
  { label: "Default (1 / 2 / 3 / 4)", value: "" },
  { label: "1 column", value: "grid-cols-1" },
  { label: "2 columns", value: "grid-cols-1 sm:grid-cols-2" },
  { label: "3 columns", value: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" },
  {
    label: "4 columns",
    value: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
  },
] as const;

type GridColsPreset = (typeof gridColsPresets)[number]["value"];

/** `Some Label (x)` -> `some-label-x`, for deriving stable control ids. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Sandbox() {
  // Dataset
  const [dataset, setDataset] = useState<DatasetKey>("items");

  // Page chrome
  const [title, setTitle] = useState("Items");
  const [subtitle, setSubtitle] = useState(
    "Manage your inventory and product listings."
  );
  const [iconName, setIconName] = useState("Package");

  // Detail
  const [detail, setDetail] = useState<DetailMode>("panel");
  const [detailWidth, setDetailWidth] = useState<DetailWidth>("md");

  // View
  const [defaultView, setDefaultView] = useState<ViewMode>("table");
  const [gridCols, setGridCols] = useState<GridColsPreset>("");
  const [keyboardNavigation, setKeyboardNavigation] = useState(true);

  // CRUD
  const [showCreate, setShowCreate] = useState(true);
  const [createLabel, setCreateLabel] = useState("New Item");
  const [showDelete, setShowDelete] = useState(false);

  // Filters
  const [enableStatusFilter, setEnableStatusFilter] = useState(true);
  const [enableSearch, setEnableSearch] = useState(true);

  // Columns
  const [enabledColumns, setEnabledColumns] = useState<Record<string, boolean>>(
    () => Object.fromEntries(itemColumnKeys.map((k) => [k, true]))
  );

  // Track dataset changes to reset columns
  const handleDatasetChange = useCallback(
    (next: DatasetKey) => {
      setDataset(next);
      const keys = next === "items" ? itemColumnKeys : taskColumnKeys;
      setEnabledColumns(Object.fromEntries(keys.map((k) => [k, true])));
      if (next === "items") {
        setTitle("Items");
        setSubtitle("Manage your inventory and product listings.");
        setIconName("Package");
        setCreateLabel("New Item");
      } else {
        setTitle("Tasks");
        setSubtitle("Track work across your project.");
        setIconName("CheckSquare");
        setCreateLabel("New Task");
      }
    },
    []
  );

  const toggleColumn = useCallback((key: string) => {
    setEnabledColumns((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Derived
  const availableColumnKeys =
    dataset === "items" ? itemColumnKeys : taskColumnKeys;

  const columns = useMemo(() => {
    return availableColumnKeys.filter((k) => enabledColumns[k]);
  }, [availableColumnKeys, enabledColumns]);

  const data = (dataset === "items" ? items : tasks) as Record<string, unknown>[];
  const Icon = iconMap[iconName] ?? Package;

  const searchFields = useMemo(() => {
    if (!enableSearch) return undefined;
    if (dataset === "items") return ["name", "category"];
    return ["title", "assignee"];
  }, [enableSearch, dataset]);

  // Copy config
  const [copied, setCopied] = useState(false);

  const generateConfig = useCallback(() => {
    const lines: string[] = [];
    lines.push(`<ResourcePage`);
    lines.push(`  resource="${dataset}"`);
    lines.push(`  title="${title}"`);
    if (subtitle) lines.push(`  subtitle="${subtitle}"`);
    lines.push(`  icon={${iconName}}`);
    lines.push(`  columns={${JSON.stringify(columns)}}`);
    lines.push(`  detail="${detail}"`);
    if (detail === "panel" && detailWidth !== "md")
      lines.push(`  detailWidth="${detailWidth}"`);
    lines.push(`  defaultView="${defaultView}"`);
    // JSON.stringify, not an interpolated quoted attribute: the value ends up
    // inside JSX, where a stray quote would emit code that doesn't parse.
    if (defaultView === "grid" && gridCols)
      lines.push(`  gridCols={${JSON.stringify(gridCols)}}`);
    if (!keyboardNavigation) lines.push(`  keyboardNavigation={false}`);
    if (enableStatusFilter) lines.push(`  statusFilter="status"`);
    if (enableSearch)
      lines.push(`  searchFields={${JSON.stringify(searchFields)}}`);
    if (showCreate) {
      lines.push(`  onCreate={() => console.log("Create")}`);
      lines.push(`  createLabel="${createLabel}"`);
    }
    if (showDelete) {
      lines.push(`  onDelete={(item) => console.log("Delete", item.id)}`);
    }
    lines.push(`/>`);
    return lines.join("\n");
  }, [
    dataset,
    title,
    subtitle,
    iconName,
    columns,
    detail,
    detailWidth,
    defaultView,
    gridCols,
    keyboardNavigation,
    enableStatusFilter,
    enableSearch,
    searchFields,
    showCreate,
    createLabel,
    showDelete,
  ]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(generateConfig());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [generateConfig]);

  // ---------------------------------------------------------------------------
  // Render helpers for controls
  // ---------------------------------------------------------------------------

  /** A single-select pill row for the config panel's enum-valued props. */
  const renderRadioGroup = (
    options: string[],
    value: string,
    onChange: (v: string) => void
  ) => (
    <div className="flex flex-wrap gap-1">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`px-2 py-1 text-xs rounded-md border transition-colors ${
            value === opt
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-foreground border-border hover:bg-muted"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );

  /**
   * A labelled boolean control for the config panel. The label is associated
   * with the checkbox (`htmlFor`/`id`) so clicking the text toggles it and a
   * screen reader announces what the checkbox is for.
   */
  const renderToggle = (
    label: string,
    checked: boolean,
    onChange: (v: boolean) => void,
    // Slug for the checkbox's id, so the label is actually associated with
    // the control (clickable, and announced by screen readers). Defaults to
    // the label itself, which is unique across this panel.
    id: string = label
  ) => {
    const inputId = `sandbox-toggle-${slugify(id)}`;
    return (
      <div className="flex items-center gap-2">
        <Checkbox
          id={inputId}
          data-testid={inputId}
          checked={checked}
          onCheckedChange={(v) => onChange(v === true)}
        />
        <label htmlFor={inputId} className="text-sm">
          {label}
        </label>
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------------

  return (
    <div className="flex gap-6 h-[calc(100vh-8rem)]">
      {/* Controls sidebar */}
      <Card className="w-80 shrink-0 overflow-y-auto">
        <CardHeader>
          <CardTitle className="text-lg">ResourcePage Configurator</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Dataset */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Dataset
            </label>
            <Select value={dataset} onValueChange={(v) => handleDatasetChange(v as DatasetKey)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="items">Items</SelectItem>
                <SelectItem value="tasks">Tasks</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Title */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Title
            </label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          {/* Subtitle */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Subtitle
            </label>
            <Input
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
            />
          </div>

          {/* Icon */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Icon
            </label>
            <Select value={iconName} onValueChange={setIconName}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {iconOptions.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Detail mode */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Detail Mode
            </label>
            {renderRadioGroup(
              ["panel", "modal", "route", "none"],
              detail,
              (v) => setDetail(v as DetailMode)
            )}
          </div>

          {/* Detail width — only when panel */}
          {detail === "panel" && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Detail Width
              </label>
              <Select value={detailWidth} onValueChange={(v) => setDetailWidth(v as DetailWidth)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sm">sm</SelectItem>
                  <SelectItem value="md">md</SelectItem>
                  <SelectItem value="lg">lg</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <Separator />

          {/* Default view */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Default View
            </label>
            {renderRadioGroup(
              ["table", "grid", "list"],
              defaultView,
              (v) => setDefaultView(v as ViewMode)
            )}
          </div>

          {/* Grid columns — only meaningful in grid view */}
          {defaultView === "grid" && (
            <div className="space-y-1 pl-6">
              <label
                htmlFor="sandbox-grid-cols"
                className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
              >
                Grid Columns
              </label>
              <Select
                value={gridCols}
                onValueChange={(v) => setGridCols(v as GridColsPreset)}
              >
                <SelectTrigger id="sandbox-grid-cols" data-testid="sandbox-grid-cols">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {gridColsPresets.map((preset) => (
                    <SelectItem key={preset.label} value={preset.value}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Keyboard navigation — active in grid/list views, default-on.
              `x` (toggle select) is deliberately not advertised: it needs
              bulkActions, which this preview doesn't configure. */}
          {renderToggle(
            "Keyboard navigation (j/k focus, Enter open, ⌫ back)",
            keyboardNavigation,
            setKeyboardNavigation,
            "keyboard-navigation"
          )}

          <Separator />

          {/* Create button */}
          {renderToggle("Show create button", showCreate, setShowCreate)}

          {showCreate && (
            <div className="space-y-1 pl-6">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Create Label
              </label>
              <Input
                value={createLabel}
                onChange={(e) => setCreateLabel(e.target.value)}
              />
            </div>
          )}

          {/* Delete action */}
          {renderToggle("Show delete action", showDelete, setShowDelete)}

          <Separator />

          {/* Status filter */}
          {renderToggle("Status filter", enableStatusFilter, setEnableStatusFilter)}

          {/* Search */}
          {renderToggle("Search", enableSearch, setEnableSearch)}

          <Separator />

          {/* Columns */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Columns
            </label>
            {availableColumnKeys.map((key) => (
              <div key={key} className="flex items-center gap-2">
                <Checkbox
                  checked={!!enabledColumns[key]}
                  onCheckedChange={() => toggleColumn(key)}
                />
                <span className="text-sm">{key}</span>
              </div>
            ))}
          </div>

          <Separator />

          {/* Copy config */}
          <Button
            variant="outline"
            className="w-full"
            onClick={handleCopy}
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-2" />
                Copy Config
              </>
            )}
          </Button>

          {/* Active config badge summary */}
          <div className="flex flex-wrap gap-1">
            <Badge variant="outline">{dataset}</Badge>
            <Badge variant="outline">{detail}</Badge>
            <Badge variant="outline">{defaultView}</Badge>
            <Badge variant="outline">
              {columns.length} col{columns.length !== 1 ? "s" : ""}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Live preview */}
      <div className="flex-1 overflow-y-auto">
        <ResourcePage
          key={`${dataset}-${defaultView}`}
          resource={dataset}
          data={data}
          total={data.length}
          title={title}
          subtitle={subtitle}
          icon={Icon}
          columns={columns}
          detail={detail}
          detailWidth={detailWidth}
          defaultView={defaultView}
          gridCols={defaultView === "grid" && gridCols ? gridCols : undefined}
          keyboardNavigation={keyboardNavigation}
          statusFilter={enableStatusFilter ? "status" : undefined}
          searchFields={searchFields}
          searchPlaceholder={
            enableSearch
              ? `Search ${dataset}...`
              : undefined
          }
          onCreate={showCreate ? () => console.log("Create") : undefined}
          createLabel={createLabel}
          onDelete={
            showDelete
              ? (item) => console.log("Delete", (item as Record<string, unknown>).id)
              : undefined
          }
        />
      </div>
    </div>
  );
}
